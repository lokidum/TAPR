import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { createAndConfirmPlatformPayment } from '../services/stripe.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();

const LISTING_FEE_CENTS = 500;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const createChairSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priceCentsPerDay: z.number().int().min(1000),
  priceCentsPerWeek: z.number().int().min(1000).optional(),
  availableFrom: z.string().datetime({ message: 'availableFrom must be ISO 8601' }),
  availableTo: z.string().datetime({ message: 'availableTo must be ISO 8601' }),
  listingType: z.enum(['daily', 'weekly', 'sick_call', 'permanent']),
  minLevelRequired: z.number().int().min(1).max(6).optional().default(1),
  isSickCall: z.boolean().optional().default(false),
  sickCallPremiumPct: z.number().int().min(0).max(100).optional().default(0),
  paymentMethodId: z.string().min(1, 'paymentMethodId required for listing fee'),
}).refine(
  data => new Date(data.availableTo) > new Date(data.availableFrom),
  { message: 'availableTo must be after availableFrom', path: ['availableTo'] }
);

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(100).optional().default(10),
  listingType: z.enum(['daily', 'weekly', 'sick_call', 'permanent']).optional(),
  minLevel: z.coerce.number().int().min(1).max(6).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
});

const updateChairSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  priceCentsPerDay: z.number().int().min(1000).optional(),
  priceCentsPerWeek: z.number().int().min(1000).optional().nullable(),
  availableFrom: z.string().datetime().optional(),
  availableTo: z.string().datetime().optional(),
  minLevelRequired: z.number().int().min(1).max(6).optional(),
  isSickCall: z.boolean().optional(),
  sickCallPremiumPct: z.number().int().min(0).max(100).optional(),
}).refine(
  data => {
    if (data.availableFrom && data.availableTo) {
      return new Date(data.availableTo) > new Date(data.availableFrom);
    }
    return true;
  },
  { message: 'availableTo must be after availableFrom', path: ['availableTo'] }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getStudioIdForUser(userId: string): Promise<string | null> {
  const studio = await prisma.studioProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return studio?.id ?? null;
}

// ── POST /chairs ───────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studioId = await getStudioIdForUser(req.user!.sub);
      if (!studioId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const body = createChairSchema.parse(req.body);
      const {
        title,
        description,
        priceCentsPerDay,
        priceCentsPerWeek,
        availableFrom,
        availableTo,
        listingType,
        minLevelRequired,
        isSickCall,
        sickCallPremiumPct,
        paymentMethodId,
      } = body;

      let paymentIntentId: string;
      try {
        const pi = await createAndConfirmPlatformPayment(
          LISTING_FEE_CENTS,
          paymentMethodId,
          { studioId, type: 'chair_listing_fee' }
        );
        if (pi.status !== 'succeeded') {
          res.status(402).json(
            errorResponse('PAYMENT_FAILED', 'Listing fee payment could not be completed')
          );
          return;
        }
        paymentIntentId = pi.id;
      } catch (err) {
        logger.warn('Chair listing fee payment failed', {
          studioId,
          error: err instanceof Error ? err.message : String(err),
        });
        res.status(402).json(
          errorResponse('PAYMENT_FAILED', 'Listing fee payment failed')
        );
        return;
      }

      const listing = await prisma.chairListing.create({
        data: {
          studioId,
          title,
          description: description ?? null,
          priceCentsPerDay,
          priceCentsPerWeek: priceCentsPerWeek ?? null,
          availableFrom: new Date(availableFrom),
          availableTo: new Date(availableTo),
          listingType,
          minLevelRequired,
          isSickCall,
          sickCallPremiumPct,
          stripeListingFeePaymentId: paymentIntentId,
        },
        include: { studio: { select: { businessName: true } } },
      });

      logger.info('Chair listing created', { listingId: listing.id, studioId });
      res.status(201).json(successResponse({ listing }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /chairs/nearby ────────────────────────────────────────────────────────
// Must be before /:id

interface NearbyChairRow {
  id: string;
  studio_id: string;
  title: string;
  description: string | null;
  price_cents_per_day: number;
  price_cents_per_week: number | null;
  available_from: Date;
  available_to: Date;
  listing_type: string;
  min_level_required: number;
  is_sick_call: boolean;
  sick_call_premium_pct: number;
  status: string;
  studio_name: string;
  distance_km: number;
}

router.get(
  '/nearby',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lat, lng, radiusKm, listingType, minLevel, maxPrice } =
        nearbyQuerySchema.parse(req.query);

      const now = new Date();
      const cutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const rows = await prisma.$queryRaw<NearbyChairRow[]>`
        SELECT
          cl.id,
          cl.studio_id,
          cl.title,
          cl.description,
          cl.price_cents_per_day,
          cl.price_cents_per_week,
          cl.available_from,
          cl.available_to,
          cl.listing_type,
          cl.min_level_required,
          cl.is_sick_call,
          cl.sick_call_premium_pct,
          cl.status,
          sp.business_name AS studio_name,
          ROUND(
            (ST_Distance(
              sp.coordinates::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            ) / 1000.0)::numeric,
            2
          ) AS distance_km
        FROM chair_listings cl
        JOIN studio_profiles sp ON cl.studio_id = sp.id
        WHERE
          cl.status = 'available'
          AND cl.available_from <= ${cutoff}::timestamptz
          AND sp.coordinates IS NOT NULL
          AND ST_DWithin(
            sp.coordinates::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusKm * 1000}
          )
          AND (${listingType ?? null}::text IS NULL OR cl.listing_type = ${listingType ?? null})
          AND (${minLevel ?? null}::int IS NULL OR cl.min_level_required <= ${minLevel ?? null})
          AND (${maxPrice ?? null}::int IS NULL OR cl.price_cents_per_day <= ${maxPrice ?? null})
        ORDER BY distance_km ASC
      `;

      const listings = rows.map(r => ({
        id: r.id,
        studioId: r.studio_id,
        title: r.title,
        description: r.description,
        priceCentsPerDay: r.price_cents_per_day,
        priceCentsPerWeek: r.price_cents_per_week,
        availableFrom: r.available_from,
        availableTo: r.available_to,
        listingType: r.listing_type,
        minLevelRequired: r.min_level_required,
        isSickCall: r.is_sick_call,
        sickCallPremiumPct: r.sick_call_premium_pct,
        status: r.status,
        studioName: r.studio_name,
        distanceKm: Number(r.distance_km),
      }));

      res.status(200).json(successResponse({ listings }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /chairs/:id ───────────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const listing = await prisma.chairListing.findUnique({
        where: { id },
        include: {
          studio: {
            select: {
              id: true,
              businessName: true,
              suburb: true,
              state: true,
              addressLine1: true,
              chairCount: true,
              isVerified: true,
            },
          },
        },
      });

      if (!listing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Chair listing not found'));
        return;
      }

      res.status(200).json(successResponse({ listing }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /chairs/:id ─────────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const studioId = await getStudioIdForUser(req.user!.sub);
      if (!studioId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const listing = await prisma.chairListing.findUnique({
        where: { id },
      });

      if (!listing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Chair listing not found'));
        return;
      }

      if (listing.studioId !== studioId) {
        res.status(403).json(errorResponse('FORBIDDEN', 'You can only update your own listings'));
        return;
      }

      const body = updateChairSchema.parse(req.body);
      const updateData: Prisma.ChairListingUpdateInput = {};
      if (body.title !== undefined) updateData.title = body.title;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.priceCentsPerDay !== undefined) updateData.priceCentsPerDay = body.priceCentsPerDay;
      if (body.priceCentsPerWeek !== undefined) updateData.priceCentsPerWeek = body.priceCentsPerWeek;
      if (body.availableFrom !== undefined) updateData.availableFrom = new Date(body.availableFrom);
      if (body.availableTo !== undefined) updateData.availableTo = new Date(body.availableTo);
      if (body.minLevelRequired !== undefined) updateData.minLevelRequired = body.minLevelRequired;
      if (body.isSickCall !== undefined) updateData.isSickCall = body.isSickCall;
      if (body.sickCallPremiumPct !== undefined) updateData.sickCallPremiumPct = body.sickCallPremiumPct;

      const updated = await prisma.chairListing.update({
        where: { id },
        data: updateData,
        include: { studio: { select: { businessName: true } } },
      });

      res.status(200).json(successResponse({ listing: updated }));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /chairs/:id ────────────────────────────────────────────────────────

router.delete(
  '/:id',
  authenticate,
  requireRole('studio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const studioId = await getStudioIdForUser(req.user!.sub);
      if (!studioId) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Studio profile not found'));
        return;
      }

      const listing = await prisma.chairListing.findUnique({
        where: { id },
      });

      if (!listing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Chair listing not found'));
        return;
      }

      if (listing.studioId !== studioId) {
        res.status(403).json(errorResponse('FORBIDDEN', 'You can only delete your own listings'));
        return;
      }

      if (listing.status !== 'available') {
        res.status(422).json(
          errorResponse('UNPROCESSABLE', 'Can only delete listings with status available')
        );
        return;
      }

      await prisma.chairListing.delete({
        where: { id },
      });

      logger.info('Chair listing deleted', { listingId: id, studioId });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
