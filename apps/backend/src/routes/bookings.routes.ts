import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.service';
import { createPaymentIntent } from '../services/stripe.service';
import { getIdempotencyResponse, setIdempotencyResponse } from '../services/redis.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createBookingSchema = z.object({
  barberId: z.string().uuid(),
  studioId: z.string().uuid().optional(),
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
  ]),
  priceCents: z.number().int().min(100),
});

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
      const { barberId, studioId, serviceType, scheduledAt, durationMinutes, priceCents } = body;
      const consumerId = req.user!.sub;

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

export default router;
