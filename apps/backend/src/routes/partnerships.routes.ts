import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.service';
import { createPartnershipEnvelope } from '../services/docusign.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';

const router = Router();

const MIN_LEVEL_FOR_PARTNERSHIP = 5;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const createPartnershipSchema = z.object({
  partnerBarberId: z.string().uuid(),
  businessName: z.string().min(1).max(200).optional(),
  state: z.string().min(1).max(50).optional(),
  structureType: z.enum(['unincorporated_jv', 'incorporated_jv', 'partnership']),
  equitySplitInitiator: z.number().int().min(0).max(100),
  equitySplitPartner: z.number().int().min(0).max(100),
  vestingMonths: z.number().int().min(1).max(120),
  cliffMonths: z.number().int().min(0).max(120),
  platformEquityPct: z.number().int().min(0).max(100).optional().default(7),
}).refine(
  (data) =>
    data.equitySplitInitiator + data.equitySplitPartner + data.platformEquityPct === 100,
  { message: 'equitySplitInitiator + equitySplitPartner + platformEquityPct must equal 100' }
);

// ── POST /partnerships ───────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const initiatorUserId = req.user!.sub;
      const body = createPartnershipSchema.parse(req.body);

      const initiatorProfile = await prisma.barberProfile.findUnique({
        where: { userId: initiatorUserId },
        include: { user: { select: { fullName: true, email: true } } },
      });

      if (!initiatorProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      if (initiatorProfile.level < MIN_LEVEL_FOR_PARTNERSHIP) {
        res.status(403).json(
          errorResponse(
            'FORBIDDEN',
            `Both barbers must be Level ${MIN_LEVEL_FOR_PARTNERSHIP}+ to create a partnership`
          )
        );
        return;
      }

      const partnerProfile = await prisma.barberProfile.findUnique({
        where: { id: body.partnerBarberId },
        include: { user: { select: { fullName: true, email: true } } },
      });

      if (!partnerProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Partner barber not found'));
        return;
      }

      if (partnerProfile.level < MIN_LEVEL_FOR_PARTNERSHIP) {
        res.status(403).json(
          errorResponse(
            'FORBIDDEN',
            `Both barbers must be Level ${MIN_LEVEL_FOR_PARTNERSHIP}+ to create a partnership`
          )
        );
        return;
      }

      if (body.partnerBarberId === initiatorProfile.id) {
        res.status(400).json(
          errorResponse('BAD_REQUEST', 'Cannot create partnership with yourself')
        );
        return;
      }

      const partnership = await prisma.partnership.create({
        data: {
          initiatingBarberId: initiatorProfile.id,
          partnerBarberId: body.partnerBarberId,
          businessName: body.businessName ?? null,
          state: body.state ?? null,
          structureType: body.structureType,
          equitySplitPctInitiator: body.equitySplitInitiator,
          equitySplitPctPartner: body.equitySplitPartner,
          platformEquityPct: body.platformEquityPct,
          vestingMonths: body.vestingMonths,
          cliffMonths: body.cliffMonths,
          status: 'draft',
        },
        include: {
          initiatingBarber: { include: { user: { select: { fullName: true } } } },
          partnerBarber: { include: { user: { select: { fullName: true } } } },
        },
      });

      res.status(201).json(successResponse(partnership));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /partnerships/:id/send ──────────────────────────────────────────────

router.post(
  '/:id/send',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;

      const partnership = await prisma.partnership.findUnique({
        where: { id },
        include: {
          initiatingBarber: { include: { user: { select: { fullName: true, email: true } } } },
          partnerBarber: { include: { user: { select: { fullName: true, email: true } } } },
        },
      });

      if (!partnership) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Partnership not found'));
        return;
      }

      if (partnership.initiatingBarber.userId !== userId) {
        res.status(403).json(
          errorResponse('FORBIDDEN', 'Only the initiating barber can send the partnership')
        );
        return;
      }

      if (partnership.status !== 'draft') {
        res.status(422).json(
          errorResponse('UNPROCESSABLE', 'Partnership has already been sent')
        );
        return;
      }

      const initiatorEmail = partnership.initiatingBarber.user.email;
      const partnerEmail = partnership.partnerBarber.user.email;

      if (!initiatorEmail || !partnerEmail) {
        res.status(422).json(
          errorResponse(
            'UNPROCESSABLE',
            'Both barbers must have an email address to send the partnership'
          )
        );
        return;
      }

      const { envelopeId } = await createPartnershipEnvelope({
        initiatorEmail,
        initiatorName: partnership.initiatingBarber.user.fullName,
        partnerEmail,
        partnerName: partnership.partnerBarber.user.fullName,
        businessName: partnership.businessName ?? '',
        state: partnership.state ?? '',
        equitySplitInitiator: partnership.equitySplitPctInitiator,
        equitySplitPartner: partnership.equitySplitPctPartner,
        platformEquityPct: partnership.platformEquityPct,
        vestingMonths: partnership.vestingMonths,
        cliffMonths: partnership.cliffMonths,
      });

      const updated = await prisma.partnership.update({
        where: { id },
        data: { docusignEnvelopeId: envelopeId, status: 'sent' },
        include: {
          initiatingBarber: { include: { user: { select: { fullName: true } } } },
          partnerBarber: { include: { user: { select: { fullName: true } } } },
        },
      });

      res.status(200).json(successResponse(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /partnerships/me ─────────────────────────────────────────────────────
// Must be before /:id

router.get(
  '/me',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const barberProfile = await prisma.barberProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
      const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, parseInt(String(req.query.limit ?? DEFAULT_PAGE_SIZE), 10))
      );
      const skip = (page - 1) * limit;

      const [partnerships, total] = await Promise.all([
        prisma.partnership.findMany({
          where: {
            OR: [
              { initiatingBarberId: barberProfile.id },
              { partnerBarberId: barberProfile.id },
            ],
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            initiatingBarber: { include: { user: { select: { fullName: true } } } },
            partnerBarber: { include: { user: { select: { fullName: true } } } },
          },
        }),
        prisma.partnership.count({
          where: {
            OR: [
              { initiatingBarberId: barberProfile.id },
              { partnerBarberId: barberProfile.id },
            ],
          },
        }),
      ]);

      res.status(200).json(
        successResponse(partnerships, {
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /partnerships/:id ────────────────────────────────────────────────────

router.get(
  '/:id',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;

      const barberProfile = await prisma.barberProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const partnership = await prisma.partnership.findFirst({
        where: {
          id,
          OR: [
            { initiatingBarberId: barberProfile.id },
            { partnerBarberId: barberProfile.id },
          ],
        },
        include: {
          initiatingBarber: { include: { user: { select: { fullName: true } } } },
          partnerBarber: { include: { user: { select: { fullName: true } } } },
        },
      });

      if (!partnership) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Partnership not found'));
        return;
      }

      res.status(200).json(successResponse(partnership));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
