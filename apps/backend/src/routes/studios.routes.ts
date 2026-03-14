import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import {
  createConnectAccount,
  createConnectOnboardingUrl,
} from '../services/stripe.service';
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

const chairsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const stripeOnboardingQuerySchema = z.object({
  returnUrl: z.string().url(),
  refreshUrl: z.string().url(),
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

interface StudioMeRow {
  id: string;
  user_id: string;
  business_name: string;
  abn: string | null;
  address_line1: string | null;
  address_line2: string | null;
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
  lat: number | null;
  lng: number | null;
}

router.get(
  '/me',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      await prisma.studioProfile.upsert({
        where: { userId },
        update: {},
        create: { userId, businessName: 'New Studio' },
      });

      const [row] = await prisma.$queryRaw<StudioMeRow[]>`
        SELECT
          sp.id,
          sp.user_id,
          sp.business_name,
          sp.abn,
          sp.address_line1,
          sp.address_line2,
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
          ST_Y(sp.coordinates::geometry)::double precision AS lat,
          ST_X(sp.coordinates::geometry)::double precision AS lng
        FROM studio_profiles sp
        WHERE sp.user_id = ${userId}::uuid
      `;

      if (!row) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const profile = {
        id: row.id,
        userId: row.user_id,
        businessName: row.business_name,
        abn: row.abn,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        suburb: row.suburb,
        state: row.state,
        postcode: row.postcode,
        googlePlaceId: row.google_place_id,
        phone: row.phone,
        websiteUrl: row.website_url,
        chairCount: row.chair_count,
        isVerified: row.is_verified,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lat: row.lat,
        lng: row.lng,
      };

      res.status(200).json(successResponse(profile));
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

      const [row] = await prisma.$queryRaw<StudioMeRow[]>`
        SELECT
          sp.id,
          sp.user_id,
          sp.business_name,
          sp.abn,
          sp.address_line1,
          sp.address_line2,
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
          ST_Y(sp.coordinates::geometry)::double precision AS lat,
          ST_X(sp.coordinates::geometry)::double precision AS lng
        FROM studio_profiles sp
        WHERE sp.user_id = ${userId}::uuid
      `;

      if (!row) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const profile = {
        id: row.id,
        userId: row.user_id,
        businessName: row.business_name,
        abn: row.abn,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        suburb: row.suburb,
        state: row.state,
        postcode: row.postcode,
        googlePlaceId: row.google_place_id,
        phone: row.phone,
        websiteUrl: row.website_url,
        chairCount: row.chair_count,
        isVerified: row.is_verified,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lat: row.lat,
        lng: row.lng,
      };

      res.status(200).json(successResponse(profile));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /studios/me/stripe-onboarding-url ─────────────────────────────────────

router.get(
  '/me/stripe-onboarding-url',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { returnUrl, refreshUrl } = stripeOnboardingQuerySchema.parse(req.query);

      await prisma.studioProfile.upsert({
        where: { userId },
        update: {},
        create: { userId, businessName: 'New Studio' },
      });

      let profile = await prisma.studioProfile.findUnique({ where: { userId } });
      if (!profile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      if (!profile.stripeAccountId) {
        const account = await createConnectAccount('AU');
        await prisma.studioProfile.update({
          where: { userId },
          data: { stripeAccountId: account.id },
        });
        profile = (await prisma.studioProfile.findUnique({ where: { userId } }))!;
      }

      const accountId = profile.stripeAccountId;
      if (!accountId) {
        res.status(500).json(errorResponse('INTERNAL_ERROR', 'Stripe account not found'));
        return;
      }

      const url = await createConnectOnboardingUrl(accountId, returnUrl, refreshUrl);

      res.status(200).json(successResponse({ url }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /studios/me/chairs ────────────────────────────────────────────────────

router.get(
  '/me/chairs',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { page, limit } = chairsQuerySchema.parse(req.query);
      const offset = (page - 1) * limit;

      const studio = await prisma.studioProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!studio) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const [chairs, total] = await Promise.all([
        prisma.chairListing.findMany({
          where: { studioId: studio.id },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          include: {
            _count: { select: { rentals: true } },
          },
        }),
        prisma.chairListing.count({ where: { studioId: studio.id } }),
      ]);

      const listings = chairs.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        priceCentsPerDay: c.priceCentsPerDay,
        priceCentsPerWeek: c.priceCentsPerWeek,
        availableFrom: c.availableFrom,
        availableTo: c.availableTo,
        listingType: c.listingType,
        minLevelRequired: c.minLevelRequired,
        isSickCall: c.isSickCall,
        sickCallPremiumPct: c.sickCallPremiumPct,
        status: c.status,
        rentalCount: c._count.rentals,
        createdAt: c.createdAt,
      }));

      res.status(200).json(successResponse({ listings, total }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /studios/me/stats ─────────────────────────────────────────────────────

router.get(
  '/me/stats',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      const studio = await prisma.studioProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!studio) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [totalChairs, rentalsThisMonth, revenueResult, businessDaysInMonth] =
        await Promise.all([
          prisma.chairListing.count({
            where: { studioId: studio.id, status: 'available' },
          }),
          prisma.chairRental.count({
            where: {
              listing: { studioId: studio.id },
              startAt: { gte: startOfMonth, lte: now },
            },
          }),
          prisma.chairRental.aggregate({
            where: {
              listing: { studioId: studio.id },
              status: 'completed',
              startAt: { gte: startOfMonth, lte: now },
            },
            _sum: { totalPriceCents: true },
          }),
          (() => {
            let count = 0;
            const d = new Date(startOfMonth);
            while (d <= now) {
              const day = d.getDay();
              if (day !== 0 && day !== 6) count++;
              d.setDate(d.getDate() + 1);
            }
            return count;
          })(),
        ]);

      const revenueThisMonth = revenueResult._sum.totalPriceCents ?? 0;
      const occupancyRate =
        totalChairs > 0 && businessDaysInMonth > 0
          ? Math.min(100, (rentalsThisMonth / (totalChairs * businessDaysInMonth)) * 100)
          : 0;

      res.status(200).json(
        successResponse({
          totalChairs,
          rentalsThisMonth,
          revenueThisMonth,
          occupancyRate: Math.round(occupancyRate * 100) / 100,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /studios/me/rentals/recent ───────────────────────────────────────────

router.get(
  '/me/rentals/recent',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      const studio = await prisma.studioProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!studio) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const rentals = await prisma.chairRental.findMany({
        where: { listing: { studioId: studio.id } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          barber: {
            include: {
              user: { select: { fullName: true, avatarUrl: true } },
            },
          },
          listing: { select: { title: true } },
        },
      });

      const items = rentals.map(r => ({
        id: r.id,
        barberName: r.barber.user.fullName ?? 'Unknown',
        barberAvatarUrl: r.barber.user.avatarUrl,
        listingTitle: r.listing.title,
        startAt: r.startAt,
        endAt: r.endAt,
        status: r.status,
      }));

      res.status(200).json(successResponse({ rentals: items }));
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
