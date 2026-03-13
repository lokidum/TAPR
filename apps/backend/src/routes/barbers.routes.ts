import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { publishToChannel } from '../services/redis.service';
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

const onCallSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Same as nearbyQuerySchema but without onCallOnly — on-call is always true here
const onCallQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).optional().default(10),
  minLevel: z.coerce.number().int().min(1).max(6).optional(),
  maxLevel: z.coerce.number().int().min(1).max(6).optional(),
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

// ── POST /barbers/me/on-call ──────────────────────────────────────────────────

router.post(
  '/me/on-call',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { lat, lng } = onCallSchema.parse(req.body);

      const existing = await prisma.barberProfile.findUnique({ where: { userId } });
      if (!existing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }
      if (existing.level < 4) {
        res.status(403).json(
          errorResponse('FORBIDDEN', `On-call requires Level 4+. Current level: ${existing.level}`)
        );
        return;
      }

      await prisma.$executeRaw`
        UPDATE barber_profiles
        SET
          is_on_call          = true,
          on_call_activated_at = NOW(),
          on_call_location    = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          updated_at          = NOW()
        WHERE user_id = ${userId}::uuid
      `;

      const profile = await prisma.barberProfile.findUnique({
        where: { userId },
        include: { user: { select: { fullName: true, avatarUrl: true } } },
      });

      await publishToChannel('barber_on_call', JSON.stringify({ barberId: userId, lat, lng }));

      res.status(200).json(successResponse(stripTokens(profile!)));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /barbers/me/on-call ────────────────────────────────────────────────

router.delete(
  '/me/on-call',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      await prisma.$executeRaw`
        UPDATE barber_profiles
        SET
          is_on_call       = false,
          on_call_location = NULL,
          updated_at       = NOW()
        WHERE user_id = ${userId}::uuid
      `;

      await publishToChannel('barber_off_call', JSON.stringify({ barberId: userId }));

      res.status(200).json(successResponse({ message: 'On-call deactivated' }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /barbers/on-call ──────────────────────────────────────────────────────

router.get(
  '/on-call',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lat, lng, radiusKm, minLevel, maxLevel } = onCallQuerySchema.parse(req.query);

      // Auto-deactivate on-call sessions older than 8 hours
      await prisma.$executeRaw`
        UPDATE barber_profiles
        SET is_on_call = false, on_call_location = NULL, updated_at = NOW()
        WHERE is_on_call = true
          AND on_call_activated_at < NOW() - INTERVAL '8 hours'
      `;

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
          AND bp.is_on_call = true
          AND bp.on_call_location IS NOT NULL
          AND ST_DWithin(
            bp.on_call_location::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusKm * 1000}
          )
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
