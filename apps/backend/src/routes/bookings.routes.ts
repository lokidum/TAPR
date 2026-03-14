import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import {
  createPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  refundPaymentIntent,
  createTransfer,
} from '../services/stripe.service';
import { getIdempotencyResponse, setIdempotencyResponse } from '../services/redis.service';
import { enqueueBookingReminder, enqueueReviewRequest } from '../services/queue.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createBookingSchema = z.object({
  barberId: z.string().uuid(),
  studioId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  serviceType: z.enum(['in_studio', 'mobile', 'on_call']),
  scheduledAt: z
    .string()
    .datetime({ message: 'scheduledAt must be an ISO 8601 datetime string' })
    .refine(v => new Date(v) > new Date(), { message: 'scheduledAt must be in the future' }),
  durationMinutes: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]).optional(),
  priceCents: z.number().int().min(100).optional(),
}).refine(
  (data) => data.serviceId || (data.priceCents && data.durationMinutes),
  { message: 'Either serviceId or both priceCents and durationMinutes are required' }
);

const reviewSchema = z.object({
  cutRating: z.number().int().min(1).max(5),
  experienceRating: z.number().int().min(1).max(5),
  reviewText: z.string().max(2000).optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getBarberProfileIdForUser(userId: string): Promise<string | null> {
  const profile = await prisma.barberProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}

// ── POST /bookings ─────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('consumer'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      // Idempotency check
      if (idempotencyKey) {
        const cached = await getIdempotencyResponse(idempotencyKey);
        if (cached) {
          res.status(201).json(JSON.parse(cached));
          return;
        }
      }

      const body = createBookingSchema.parse(req.body);
      const { barberId, studioId, serviceId, serviceType, scheduledAt } = body;
      const consumerId = req.user!.sub;

      let resolvedPriceCents: number | undefined = body.priceCents;
      let resolvedDurationMinutes: number | undefined = body.durationMinutes;

      if (serviceId) {
        const service = await prisma.barberService.findFirst({
          where: { id: serviceId, barberId, isActive: true },
        });
        if (!service) {
          res.status(404).json(errorResponse('NOT_FOUND', 'Service not found or inactive'));
          return;
        }
        resolvedPriceCents = service.priceCents;
        resolvedDurationMinutes = service.durationMinutes;
      }

      if (!resolvedPriceCents || !resolvedDurationMinutes) {
        res.status(400).json(errorResponse('VALIDATION_ERROR', 'Price and duration could not be determined'));
        return;
      }

      const priceCents = resolvedPriceCents;
      const durationMinutes = resolvedDurationMinutes;

      // Fetch barber — must exist, be active, and have a Stripe account
      const barber = await prisma.barberProfile.findUnique({
        where: { id: barberId },
        include: {
          user: { select: { isActive: true, isBanned: true } },
        },
      });

      if (!barber || !barber.user.isActive || barber.user.isBanned) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      if (!barber.stripeAccountId) {
        res
          .status(422)
          .json(errorResponse('UNPROCESSABLE', 'Barber has not completed Stripe onboarding'));
        return;
      }

      // Fee calculation
      const platformFeeCents = Math.round(priceCents * 0.1);
      const studioPayoutCents = studioId ? Math.round(priceCents * 0.05) : 0;
      const barberPayoutCents = priceCents - platformFeeCents - studioPayoutCents;

      // Create Stripe PaymentIntent (capture_method: manual)
      const paymentIntent = await createPaymentIntent({
        amountCents: priceCents,
        barberStripeAccountId: barber.stripeAccountId,
        platformFeeCents,
        metadata: {
          consumerId,
          barberId,
          ...(studioId ? { studioId } : {}),
        },
      });

      // Persist booking
      const booking = await prisma.booking.create({
        data: {
          consumerId,
          barberId,
          studioId: studioId ?? null,
          serviceId: serviceId ?? null,
          serviceType,
          scheduledAt: new Date(scheduledAt),
          durationMinutes,
          priceCents,
          platformFeeCents,
          barberPayoutCents,
          studioPayoutCents: studioId ? studioPayoutCents : null,
          stripePaymentIntentId: paymentIntent.id,
          status: 'pending',
        },
      });

      const responseBody = successResponse({
        booking,
        clientSecret: paymentIntent.client_secret,
      });

      // Cache response for idempotency replay
      if (idempotencyKey) {
        await setIdempotencyResponse(idempotencyKey, JSON.stringify(responseBody), 86400);
      }

      logger.info('Booking created', { bookingId: booking.id, consumerId, barberId });

      res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /bookings/barber/upcoming ──────────────────────────────────────────────
// Must be before /:id to avoid "barber" matching as id

router.get(
  '/barber/upcoming',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const barberProfileId = await getBarberProfileIdForUser(req.user!.sub);
      if (!barberProfileId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const bookings = await prisma.booking.findMany({
        where: {
          barberId: barberProfileId,
          status: { in: ['pending', 'confirmed'] },
          scheduledAt: { gt: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
      });

      res.json(successResponse({ bookings }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /bookings/barber/history ───────────────────────────────────────────────

router.get(
  '/barber/history',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const barberProfileId = await getBarberProfileIdForUser(req.user!.sub);
      if (!barberProfileId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? 20), 10)));
      const skip = (page - 1) * limit;

      const [bookings, total] = await Promise.all([
        prisma.booking.findMany({
          where: {
            barberId: barberProfileId,
            status: { in: ['completed', 'cancelled'] },
          },
          orderBy: { scheduledAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.booking.count({
          where: {
            barberId: barberProfileId,
            status: { in: ['completed', 'cancelled'] },
          },
        }),
      ]);

      res.json(
        successResponse(
          { bookings },
          { pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
        )
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /bookings/:id ──────────────────────────────────────────────────────────

router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const booking = await prisma.booking.findUnique({ where: { id } });

      if (!booking) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Booking not found'));
        return;
      }

      const user = req.user!;
      if (user.role === 'admin') {
        res.json(successResponse({ booking }));
        return;
      }
      if (user.role === 'consumer' && booking.consumerId === user.sub) {
        res.json(successResponse({ booking }));
        return;
      }
      if (user.role === 'barber') {
        const barberProfileId = await getBarberProfileIdForUser(user.sub);
        if (barberProfileId && booking.barberId === barberProfileId) {
          res.json(successResponse({ booking }));
          return;
        }
      }

      res.status(403).json(errorResponse('FORBIDDEN', 'You do not have access to this booking'));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /bookings/:id/confirm ────────────────────────────────────────────────

router.patch(
  '/:id/confirm',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const barberProfileId = await getBarberProfileIdForUser(req.user!.sub);
      if (!barberProfileId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Booking not found'));
        return;
      }
      if (booking.barberId !== barberProfileId) {
        res.status(403).json(errorResponse('FORBIDDEN', 'Booking is not assigned to you'));
        return;
      }
      if (booking.status !== 'pending') {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Booking must be in pending status'));
        return;
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'confirmed' },
      });

      const delayMs = Math.max(0, updated.scheduledAt.getTime() - Date.now() - ONE_HOUR_MS);
      await enqueueBookingReminder(
        { bookingId: updated.id, consumerId: updated.consumerId, barberId: updated.barberId },
        delayMs
      );

      logger.info('Booking confirmed', { bookingId: id, barberId: barberProfileId });
      res.json(successResponse({ booking: updated }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /bookings/:id/cancel ─────────────────────────────────────────────────

router.patch(
  '/:id/cancel',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user!;

      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Booking not found'));
        return;
      }
      if (booking.status === 'completed' || booking.status === 'cancelled') {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Booking cannot be cancelled'));
        return;
      }

      const barberProfileId = user.role === 'barber' ? await getBarberProfileIdForUser(user.sub) : null;
      const isConsumer = user.role === 'consumer' && booking.consumerId === user.sub;
      const isBarber = user.role === 'barber' && barberProfileId && booking.barberId === barberProfileId;

      if (!isConsumer && !isBarber) {
        res.status(403).json(errorResponse('FORBIDDEN', 'Only the consumer or barber can cancel this booking'));
        return;
      }

      const now = Date.now();
      const scheduledAt = booking.scheduledAt.getTime();
      const hoursUntil = (scheduledAt - now) / (60 * 60 * 1000);
      const moreThan24h = hoursUntil > 24;

      const piId = booking.stripePaymentIntentId;
      if (!piId) {
        const updated = await prisma.booking.update({
          where: { id },
          data: { status: 'cancelled' },
        });
        res.json(successResponse({ booking: updated }));
        return;
      }

      if (moreThan24h) {
        await cancelPaymentIntent(piId);
      } else {
        if (isBarber) {
          await cancelPaymentIntent(piId);
        } else {
          await capturePaymentIntent(piId);
          const refundCents = Math.floor(booking.priceCents * 0.5);
          await refundPaymentIntent(piId, refundCents);
        }
      }

      const updated = await prisma.booking.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      logger.info('Booking cancelled', { bookingId: id, cancelledBy: user.role });
      res.json(successResponse({ booking: updated }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /bookings/:id/complete ───────────────────────────────────────────────

router.patch(
  '/:id/complete',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const barberProfileId = await getBarberProfileIdForUser(req.user!.sub);
      if (!barberProfileId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const booking = await prisma.booking.findUnique({
        where: { id },
        include: { studio: { select: { stripeAccountId: true } } },
      });
      if (!booking) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Booking not found'));
        return;
      }
      if (booking.barberId !== barberProfileId) {
        res.status(403).json(errorResponse('FORBIDDEN', 'Booking is not assigned to you'));
        return;
      }
      if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
        res.status(422).json(
          errorResponse('UNPROCESSABLE', 'Booking must be in confirmed or in_progress status')
        );
        return;
      }

      const piId = booking.stripePaymentIntentId;
      if (!piId) {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'No payment intent associated with booking'));
        return;
      }

      await capturePaymentIntent(piId);

      let stripeTransferId: string | null = null;
      if (booking.studioId && booking.studioPayoutCents && booking.studio?.stripeAccountId) {
        const transfer = await createTransfer(
          booking.studioPayoutCents,
          booking.studio.stripeAccountId,
          { bookingId: id }
        );
        stripeTransferId = transfer.id;
      }

      const [updated] = await prisma.$transaction([
        prisma.booking.update({
          where: { id },
          data: { status: 'completed', stripeTransferId },
        }),
        prisma.barberProfile.update({
          where: { id: barberProfileId },
          data: { totalVerifiedCuts: { increment: 1 } },
        }),
      ]);

      await enqueueReviewRequest(
        { bookingId: updated.id, consumerId: updated.consumerId, barberId: updated.barberId },
        TWO_HOURS_MS
      );

      logger.info('Booking completed', { bookingId: id, barberId: barberProfileId });
      res.json(successResponse({ booking: updated }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /bookings/:id/review ─────────────────────────────────────────────────

router.post(
  '/:id/review',
  authenticate,
  requireRole('consumer'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const consumerId = req.user!.sub;

      const body = reviewSchema.parse(req.body);
      const { cutRating, experienceRating, reviewText } = body;

      const booking = await prisma.booking.findUnique({ where: { id } });
      if (!booking) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Booking not found'));
        return;
      }
      if (booking.consumerId !== consumerId) {
        res.status(403).json(errorResponse('FORBIDDEN', 'Only the consumer who booked can review'));
        return;
      }
      if (booking.status !== 'completed') {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Booking must be completed to review'));
        return;
      }
      if (booking.reviewedAt) {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Booking has already been reviewed'));
        return;
      }

      const now = new Date();
      await prisma.booking.update({
        where: { id },
        data: {
          cutRating,
          experienceRating,
          reviewText: reviewText ?? null,
          reviewedAt: now,
        },
      });

      const avgResult = await prisma.$queryRaw<
        { avg: number | null }[]
      >(Prisma.sql`
        SELECT AVG((cut_rating + experience_rating) / 2.0)::double precision as avg
        FROM bookings
        WHERE barber_id = ${booking.barberId} AND reviewed_at IS NOT NULL
      `);
      const avgRating = avgResult[0]?.avg ?? 0;
      const roundedAvg = Math.round(avgRating * 100) / 100;

      const ratingsCount = await prisma.booking.count({
        where: { barberId: booking.barberId, reviewedAt: { not: null } },
      });

      await prisma.barberProfile.update({
        where: { id: booking.barberId },
        data: { averageRating: roundedAvg, totalRatings: ratingsCount },
      });

      const updated = await prisma.booking.findUnique({ where: { id } });
      res.json(successResponse({ booking: updated }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
