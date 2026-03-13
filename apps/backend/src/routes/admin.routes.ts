import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { refundPaymentIntent } from '../services/stripe.service';
import { deleteAllUserTokens } from '../services/redis.service';
import { enqueueNotification } from '../services/queue.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Apply admin role to all routes
router.use(authenticate, requireRole('admin'));

// ── Schemas ───────────────────────────────────────────────────────────────────

const banUserSchema = z.object({
  reason: z.string().min(1, 'Ban reason is required'),
});

const verifyCertSchema = z.object({
  aqfLevel: z.string().min(1, 'AQF level is required'),
});

const setLevelSchema = z.object({
  level: z.union([z.literal(5), z.literal(6)]),
  title: z.string().optional(),
});

const resolveDisputeSchema = z.object({
  status: z.enum(['resolved_for_claimant', 'resolved_for_respondent']),
  notes: z.string().min(1, 'Resolution notes are required'),
});

// ── GET /admin/users ───────────────────────────────────────────────────────────

const listUsersQuerySchema = z.object({
  role: z.enum(['consumer', 'barber', 'studio', 'admin']).optional(),
  isBanned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
});

router.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listUsersQuerySchema.parse(req.query);
      const { role, isBanned, search, page, limit } = query;
      const skip = (page - 1) * limit;

      const where: Prisma.UserWhereInput = {
        ...(role ? { role } : {}),
        ...(isBanned !== undefined ? { isBanned } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isBanned: true,
            banReason: true,
            createdAt: true,
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.status(200).json(
        successResponse(users, {
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /admin/users/:id/ban ─────────────────────────────────────────────────

router.patch(
  '/users/:id/ban',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const body = banUserSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        res.status(404).json(errorResponse('NOT_FOUND', 'User not found'));
        return;
      }

      await prisma.user.update({
        where: { id },
        data: { isBanned: true, banReason: body.reason },
      });

      await deleteAllUserTokens(id);

      logger.info('User banned', { userId: id, reason: body.reason });
      res.status(200).json(successResponse({ banned: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /admin/users/:id/unban ───────────────────────────────────────────────

router.patch(
  '/users/:id/unban',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        res.status(404).json(errorResponse('NOT_FOUND', 'User not found'));
        return;
      }

      await prisma.user.update({
        where: { id },
        data: { isBanned: false, banReason: null },
      });

      logger.info('User unbanned', { userId: id });
      res.status(200).json(successResponse({ unbanned: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /admin/barbers/:id/verify-cert ───────────────────────────────────────

router.patch(
  '/barbers/:id/verify-cert',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const body = verifyCertSchema.parse(req.body);

      const barber = await prisma.barberProfile.findUnique({ where: { id } });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      const now = new Date();
      await prisma.barberProfile.update({
        where: { id },
        data: { aqfCertLevel: body.aqfLevel, certVerifiedAt: now },
      });

      logger.info('Barber cert verified', { barberId: id, aqfLevel: body.aqfLevel });
      res.status(200).json(successResponse({ verified: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /admin/barbers/:id/set-level ──────────────────────────────────────────

router.patch(
  '/barbers/:id/set-level',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const body = setLevelSchema.parse(req.body);

      const barber = await prisma.barberProfile.findUnique({ where: { id } });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      const updateData: Prisma.BarberProfileUpdateInput = {
        level: body.level,
        ...(body.title !== undefined && { title: body.title }),
      };

      await prisma.barberProfile.update({
        where: { id },
        data: updateData,
      });

      logger.info('Barber level set', { barberId: id, level: body.level });
      res.status(200).json(successResponse({ updated: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /admin/disputes ────────────────────────────────────────────────────────

const listDisputesQuerySchema = z.object({
  status: z.enum(['open', 'under_review', 'resolved_for_claimant', 'resolved_for_respondent', 'escalated']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
});

router.get(
  '/disputes',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listDisputesQuerySchema.parse(req.query);
      const { status, page, limit } = query;
      const skip = (page - 1) * limit;

      const where: Prisma.DisputeWhereInput = {
        ...(status ? { status } : {}),
      };

      const [disputes, total] = await Promise.all([
        prisma.dispute.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            rental: true,
            raisedBy: { select: { fullName: true, email: true } },
            against: { select: { fullName: true, email: true } },
          },
        }),
        prisma.dispute.count({ where }),
      ]);

      res.status(200).json(
        successResponse(disputes, {
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /admin/disputes/:id/resolve ───────────────────────────────────────────

router.patch(
  '/disputes/:id/resolve',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: disputeId } = req.params;
      const adminId = req.user!.sub;
      const body = resolveDisputeSchema.parse(req.body);

      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: {
          rental: true,
          raisedBy: { select: { id: true } },
          against: { select: { id: true } },
        },
      });

      if (!dispute) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Dispute not found'));
        return;
      }

      if (dispute.adminId) {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Dispute is already resolved'));
        return;
      }

      const now = new Date();

      if (body.status === 'resolved_for_claimant' && dispute.bookingId && dispute.rental) {
        const booking = dispute.rental;
        const piId = booking.stripePaymentIntentId;
        if (piId && booking.priceCents > 0) {
          try {
            await refundPaymentIntent(piId, booking.priceCents);
            logger.info('Refund processed for dispute resolution', {
              disputeId,
              bookingId: booking.id,
              amountCents: booking.priceCents,
            });
          } catch (err) {
            logger.error('Refund failed for dispute resolution', {
              disputeId,
              bookingId: booking.id,
              err,
            });
            res.status(500).json(
              errorResponse('INTERNAL_ERROR', 'Failed to process refund')
            );
            return;
          }
        }
      }

      await prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: body.status,
          resolutionNotes: body.notes,
          adminId,
          resolvedAt: now,
        },
      });

      await enqueueNotification({
        userId: dispute.raisedById,
        type: 'dispute_resolved',
        title: 'Dispute resolved',
        body: `Your dispute has been resolved: ${body.notes}`,
        data: { disputeId, status: body.status },
      });
      await enqueueNotification({
        userId: dispute.againstId,
        type: 'dispute_resolved',
        title: 'Dispute resolved',
        body: `A dispute you were involved in has been resolved: ${body.notes}`,
        data: { disputeId, status: body.status },
      });

      logger.info('Dispute resolved', { disputeId, status: body.status, adminId });
      res.status(200).json(successResponse({ resolved: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /admin/metrics ─────────────────────────────────────────────────────────

router.get(
  '/metrics',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        usersByRole,
        bookingsByStatus,
        revenueThisMonth,
        activeChairListings,
        partnershipsByStatus,
      ] = await Promise.all([
        prisma.user.groupBy({
          by: ['role'],
          _count: { id: true },
        }),
        prisma.booking.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
        prisma.booking.aggregate({
          where: {
            status: 'completed',
            updatedAt: { gte: startOfMonth },
          },
          _sum: { priceCents: true },
        }),
        prisma.chairListing.count({
          where: {
            status: 'available',
            availableFrom: { lte: now },
            availableTo: { gte: now },
          },
        }),
        prisma.partnership.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
      ]);

      const totalUsersByRole = Object.fromEntries(
        usersByRole.map((r) => [r.role, r._count.id])
      );
      const totalBookingsByStatus = Object.fromEntries(
        bookingsByStatus.map((b) => [b.status, b._count.id])
      );
      const totalPartnershipsByStatus = Object.fromEntries(
        partnershipsByStatus.map((p) => [p.status, p._count.id])
      );

      res.status(200).json(
        successResponse({
          totalUsersByRole,
          totalBookingsByStatus,
          totalRevenueThisMonthCents: revenueThisMonth._sum.priceCents ?? 0,
          totalActiveChairListings: activeChairListings,
          totalPartnershipsByStatus,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;
