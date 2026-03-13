import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';

const router = Router();

// ── Zod schemas ───────────────────────────────────────────────────────────────

const updateStudioSchema = z
  .object({
    businessName: z.string().min(1).max(200).optional(),
    abn: z.string().regex(/^\d{11}$/, 'ABN must be exactly 11 digits').optional(),
    addressLine1: z.string().max(200).optional(),
    suburb: z.string().max(100).optional(),
    state: z.string().max(50).optional(),
    postcode: z.string().max(10).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    googlePlaceId: z.string().optional(),
    phone: z.string().optional(),
    websiteUrl: z.string().url('Must be a valid URL').optional(),
    chairCount: z.number().int().min(1).optional(),
  })
  .refine(d => (d.lat === undefined) === (d.lng === undefined), {
    message: 'lat and lng must both be provided or both omitted',
    path: ['lat'],
  });

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).optional().default(10),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface NearbyStudioRow {
  id: string;
  user_id: string;
  business_name: string;
  abn: string | null;
  address_line1: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  google_place_id: string | null;
  phone: string | null;
  website_url: string | null;
  chair_count: number;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
  full_name: string | null;
  avatar_url: string | null;
  active_chair_listings: number;
  distance_km: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripSensitive<T extends { stripeAccountId?: unknown }>(
  profile: T
): Omit<T, 'stripeAccountId'> {
  const { stripeAccountId: _s, ...safe } = profile;
  return safe;
}

// ── GET /studios/me ───────────────────────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      const profile = await prisma.studioProfile.upsert({
        where: { userId },
        update: {},
        create: { userId, businessName: 'New Studio' },
      });

      res.status(200).json(successResponse(stripSensitive(profile)));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /studios/me ─────────────────────────────────────────────────────────

router.patch(
  '/me',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { lat, lng, ...prismaData } = updateStudioSchema.parse(req.body);

      try {
        if (Object.keys(prismaData).length > 0) {
          await prisma.studioProfile.update({ where: { userId }, data: prismaData });
        }

        if (lat !== undefined && lng !== undefined) {
          await prisma.$executeRaw`
            UPDATE studio_profiles
            SET
              coordinates = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
              updated_at  = NOW()
            WHERE user_id = ${userId}::uuid
          `;
        }
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
          return;
        }
        throw err;
      }

      const profile = await prisma.studioProfile.findUnique({ where: { userId } });

      res.status(200).json(successResponse(stripSensitive(profile!)));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /studios/nearby ───────────────────────────────────────────────────────

router.get(
  '/nearby',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lat, lng, radiusKm } = nearbyQuerySchema.parse(req.query);

      const rows = await prisma.$queryRaw<NearbyStudioRow[]>`
        SELECT
          sp.id,
          sp.user_id,
          sp.business_name,
          sp.abn,
          sp.address_line1,
          sp.suburb,
          sp.state,
          sp.postcode,
          sp.google_place_id,
          sp.phone,
          sp.website_url,
          sp.chair_count,
          sp.is_verified,
          sp.created_at,
          sp.updated_at,
          u.full_name,
          u.avatar_url,
          (
            SELECT COUNT(*)::int
            FROM chair_listings cl
            WHERE cl.studio_id = sp.id AND cl.status = 'available'
          ) AS active_chair_listings,
          ROUND(
            (ST_Distance(
              sp.coordinates::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            ) / 1000.0)::numeric,
            2
          ) AS distance_km
        FROM studio_profiles sp
        JOIN users u ON u.id = sp.user_id
        WHERE
          u.is_active = true
          AND u.is_banned = false
          AND sp.coordinates IS NOT NULL
          AND ST_DWithin(
            sp.coordinates::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusKm * 1000}
          )
        ORDER BY distance_km ASC
      `;

      res.status(200).json(successResponse(rows));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /studios/:id ──────────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const [studio, activeChairListings, upcomingEvents] = await Promise.all([
        prisma.studioProfile.findUnique({
          where: { id },
          include: {
            user: { select: { isActive: true, isBanned: true } },
          },
        }),
        prisma.chairListing.count({
          where: { studioId: id, status: 'available' },
        }),
        prisma.event.count({
          where: {
            studioId: id,
            status: { in: ['planning', 'confirmed', 'live'] },
            startsAt: { gte: new Date() },
          },
        }),
      ]);

      if (!studio || !studio.user.isActive || studio.user.isBanned) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio not found'));
        return;
      }

      const { user: _user, ...studioData } = studio;

      res.status(200).json(
        successResponse(stripSensitive({ ...studioData, activeChairListings, upcomingEvents }))
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;
