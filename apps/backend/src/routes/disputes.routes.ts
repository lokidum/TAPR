import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.service';
import { enqueueNotification } from '../services/queue.service';
import { authenticate } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const createBookingDisputeSchema = z.object({
  reason: z.string().min(20, 'Reason must be at least 20 characters'),
  evidenceUrls: z.array(z.string().url()).max(5).optional().default([]),
});

// ── POST /bookings/:id/dispute ──────────────────────────────────────────────────
// Mounted under /bookings in index

export function attachBookingDisputeRoute(bookingsRouter: Router): void {
  bookingsRouter.post(
    '/:id/dispute',
    authenticate,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id: bookingId } = req.params;
        const userId = req.user!.sub;

        const body = createBookingDisputeSchema.parse(req.body);
        const { reason, evidenceUrls } = body;

        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: {
            consumer: { select: { id: true } },
            barber: { include: { user: { select: { id: true } } } },
          },
        });

        if (!booking) {
          res.status(404).json(errorResponse('NOT_FOUND', 'Booking not found'));
          return;
        }

        const consumerUserId = booking.consumer.id;
        const barberUserId = booking.barber.user.id;

        const isConsumer = userId === consumerUserId;
        const isBarber = userId === barberUserId;

        if (!isConsumer && !isBarber) {
          res.status(403).json(
            errorResponse('FORBIDDEN', 'Only the consumer or barber on this booking can raise a dispute')
          );
          return;
        }

        if (booking.status === 'disputed') {
          res.status(422).json(errorResponse('UNPROCESSABLE', 'Booking is already disputed'));
          return;
        }

        if (booking.status !== 'completed') {
          res.status(422).json(
            errorResponse('UNPROCESSABLE', 'Can only dispute a completed booking')
          );
          return;
        }

        const completedAt = booking.updatedAt.getTime();
        if (Date.now() - completedAt > SEVEN_DAYS_MS) {
          res.status(422).json(
            errorResponse('UNPROCESSABLE', 'Cannot dispute a booking older than 7 days after completion')
          );
          return;
        }

        const raisedById = userId;
        const againstId = isConsumer ? barberUserId : consumerUserId;

        const [dispute] = await prisma.$transaction([
          prisma.dispute.create({
            data: {
              bookingId,
              raisedById,
              againstId,
              reason,
              evidenceUrls: evidenceUrls ?? [],
            },
          }),
          prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'disputed' },
          }),
        ]);

        await enqueueNotification({
          userId: againstId,
          type: 'dispute_created',
          title: 'Booking dispute opened',
          body: 'A dispute has been opened for your booking. Our team will review it.',
          data: { bookingId, disputeId: dispute.id },
        });

        const admins = await prisma.user.findMany({
          where: { role: 'admin' },
          select: { id: true },
        });
        for (const admin of admins) {
          await enqueueNotification({
            userId: admin.id,
            type: 'dispute_created',
            title: 'Booking dispute requires review',
            body: `Dispute ${dispute.id}: ${reason}`,
            data: { bookingId, disputeId: dispute.id },
          });
        }

        logger.info('Booking dispute created', { bookingId, disputeId: dispute.id, raisedById, againstId });

        res.status(201).json(successResponse({ dispute }));
      } catch (err) {
        next(err);
      }
    }
  );
}

// ── GET /disputes/me ───────────────────────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;

      const disputes = await prisma.dispute.findMany({
        where: {
          OR: [{ raisedById: userId }, { againstId: userId }],
        },
        include: {
          rental: true,
          raisedBy: { select: { fullName: true, avatarUrl: true } },
          against: { select: { fullName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json(successResponse({ disputes }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
