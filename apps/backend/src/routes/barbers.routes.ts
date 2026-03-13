import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';

const router = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const updateBarberSchema = z.object({
  bio: z.string().max(500).optional(),
  instagramHandle: z.string().optional(),
  tiktokHandle: z.string().optional(),
  abn: z.string().regex(/^\d{11}$/, 'ABN must be exactly 11 digits').optional(),
  aqfCertLevel: z.enum(['cert_iii', 'cert_iv', 'diploma']).optional(),
  serviceRadiusKm: z.number().int().min(1).max(50).optional(),
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).optional().default(10),
  minLevel: z.coerce.number().int().min(1).max(6).optional(),
  maxLevel: z.coerce.number().int().min(1).max(6).optional(),
  onCallOnly: z.string().optional().default('false').transform(v => v === 'true'),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface NearbyBarberRow {
  id: string;
  user_id: string;
  level: number;
  title: string | null;
  bio: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  is_on_call: boolean;
  service_radius_km: number;
  abn: string | null;
  aqf_cert_level: string | null;
  is_sustainable: boolean;
  total_verified_cuts: number;
  average_rating: string; // Prisma returns Decimal as string from $queryRaw
  total_ratings: number;
  created_at: Date;
  updated_at: Date;
  full_name: string | null;
  avatar_url: string | null;
  distance_km: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripTokens<T extends { instagramAccessToken?: unknown; tiktokAccessToken?: unknown }>(
  profile: T
): Omit<T, 'instagramAccessToken' | 'tiktokAccessToken'> {
  const { instagramAccessToken: _i, tiktokAccessToken: _t, ...safe } = profile;
  return safe;
}

// ── GET /barbers/me ───────────────────────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      const profile = await prisma.barberProfile.upsert({
        where: { userId },
        update: {},
        create: { userId, level: 1 },
        include: { user: { select: { fullName: true, avatarUrl: true } } },
      });

      res.status(200).json(successResponse(stripTokens(profile)));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /barbers/me ─────────────────────────────────────────────────────────

router.patch(
  '/me',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const data = updateBarberSchema.parse(req.body);

      const profile = await prisma.barberProfile.update({
        where: { userId },
        data,
        include: { user: { select: { fullName: true, avatarUrl: true } } },
      });

      res.status(200).json(successResponse(stripTokens(profile)));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }
      next(err);
    }
  }
);

// ── GET /barbers/nearby ───────────────────────────────────────────────────────

router.get(
  '/nearby',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lat, lng, radiusKm, minLevel, maxLevel, onCallOnly } =
        nearbyQuerySchema.parse(req.query);

      const rows = await prisma.$queryRaw<NearbyBarberRow[]>`
        SELECT
          bp.id,
          bp.user_id,
          bp.level,
          bp.title,
          bp.bio,
          bp.instagram_handle,
          bp.tiktok_handle,
          bp.is_on_call,
          bp.service_radius_km,
          bp.abn,
          bp.aqf_cert_level,
          bp.is_sustainable,
          bp.total_verified_cuts,
          bp.average_rating,
          bp.total_ratings,
          bp.created_at,
          bp.updated_at,
          u.full_name,
          u.avatar_url,
          ROUND(
            (ST_Distance(
              bp.on_call_location::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            ) / 1000.0)::numeric,
            2
          ) AS distance_km
        FROM barber_profiles bp
        JOIN users u ON u.id = bp.user_id
        WHERE
          u.is_active = true
          AND u.is_banned = false
          AND bp.on_call_location IS NOT NULL
          AND ST_DWithin(
            bp.on_call_location::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusKm * 1000}
          )
          AND (${onCallOnly}::boolean = false OR bp.is_on_call = true)
          AND (${onCallOnly}::boolean = true  OR bp.level > 2)
          AND bp.level >= ${minLevel ?? 1}
          AND bp.level <= ${maxLevel ?? 6}
        ORDER BY distance_km ASC
      `;

      res.status(200).json(successResponse(rows));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /barbers/:id ──────────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const profile = await prisma.barberProfile.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              role: true,
              createdAt: true,
            },
          },
        },
      });

      if (!profile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      res.status(200).json(successResponse(stripTokens(profile)));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
