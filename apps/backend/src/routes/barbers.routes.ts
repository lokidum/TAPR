import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import { publishToChannel } from '../services/redis.service';
import {
  generateUploadPresignedUrl,
  generateDownloadUrl,
  objectExists,
  deleteObject,
} from '../services/storage.service';
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
  levelUpPending: z.literal(false).optional(),
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

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'] as const;

const portfolioUploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  mediaType: z.enum(['image', 'video']),
});

const portfolioCreateSchema = z.object({
  key: z.string().min(1),
  mediaType: z.enum(['image', 'video']),
  caption: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).optional().default([]),
});

const portfolioUpdateSchema = z.object({
  caption: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(50)).optional(),
  isFeatured: z.boolean().optional(),
});

const portfolioPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const feedQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(50).optional().default(10),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  durationMinutes: z.number().int().min(15).max(480),
  priceCents: z.number().int().min(0),
});

const updateServiceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  priceCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface FeedRow {
  id: string;
  media_type: string;
  cdn_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  like_count: number;
  view_count: number;
  created_at: Date;
  barber_id: string;
  barber_user_id: string;
  barber_full_name: string | null;
  barber_avatar_url: string | null;
  barber_level: number;
  barber_title: string | null;
  barber_is_on_call: boolean;
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

// ── POST /barbers/me/portfolio/upload-url ─────────────────────────────────────

router.post(
  '/me/portfolio/upload-url',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { fileName, mimeType, mediaType } = portfolioUploadUrlSchema.parse(req.body);

      const barberProfile = await prisma.barberProfile.findUnique({ where: { userId } });
      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const maxSizeMb = mediaType === 'image' ? 5 : 500;

      // Sanitise fileName to just its extension to prevent path traversal
      const dotIdx = fileName.lastIndexOf('.');
      const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
      const uuid = crypto.randomUUID();
      const key = `portfolio/${barberProfile.id}/${uuid}${ext}`;

      const uploadUrl = await generateUploadPresignedUrl(key, mimeType, maxSizeMb);
      const cdnUrl = generateDownloadUrl(key);

      res.status(200).json(successResponse({ uploadUrl, key, cdnUrl }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /barbers/me/portfolio ────────────────────────────────────────────────

router.post(
  '/me/portfolio',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { key, mediaType, caption, tags } = portfolioCreateSchema.parse(req.body);

      const barberProfile = await prisma.barberProfile.findUnique({ where: { userId } });
      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const exists = await objectExists(key);
      if (!exists) {
        res.status(422).json(errorResponse('FILE_NOT_FOUND', 'File not found in S3. Upload it first using the presigned URL.'));
        return;
      }

      const cdnUrl = generateDownloadUrl(key);

      const item = await prisma.portfolioItem.create({
        data: {
          barberId: barberProfile.id,
          mediaType,
          s3Key: key,
          cdnUrl,
          caption,
          tags: tags ?? [],
        },
      });

      res.status(201).json(successResponse(item));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /barbers/me/portfolio/stats ────────────────────────────────────────────

router.get(
  '/me/portfolio/stats',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;

      const barberProfile = await prisma.barberProfile.findUnique({ where: { userId } });
      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const rows = await prisma.$queryRaw<
        [{ total_items: bigint; total_views: bigint; total_likes: bigint }]
      >(
        Prisma.sql`
          SELECT
            COUNT(*)::bigint AS total_items,
            COALESCE(SUM(view_count), 0)::bigint AS total_views,
            COALESCE(SUM(like_count), 0)::bigint AS total_likes
          FROM portfolio_items
          WHERE barber_id = ${barberProfile.id}
        `
      );

      const row = rows[0];
      res.status(200).json(
        successResponse({
          totalItems: Number(row?.total_items ?? 0),
          totalViews: Number(row?.total_views ?? 0),
          totalLikes: Number(row?.total_likes ?? 0),
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /barbers/me/portfolio/:itemId ───────────────────────────────────────

router.patch(
  '/me/portfolio/:itemId',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { itemId } = req.params;
      const data = portfolioUpdateSchema.parse(req.body);

      const barberProfile = await prisma.barberProfile.findUnique({ where: { userId } });
      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const item = await prisma.portfolioItem.findFirst({
        where: { id: itemId, barberId: barberProfile.id },
      });
      if (!item) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Portfolio item not found'));
        return;
      }

      const updated = await prisma.portfolioItem.update({ where: { id: itemId }, data });

      res.status(200).json(successResponse(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /barbers/me/portfolio/:itemId ──────────────────────────────────────

router.delete(
  '/me/portfolio/:itemId',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { itemId } = req.params;

      const barberProfile = await prisma.barberProfile.findUnique({ where: { userId } });
      if (!barberProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const item = await prisma.portfolioItem.findFirst({
        where: { id: itemId, barberId: barberProfile.id },
      });
      if (!item) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Portfolio item not found'));
        return;
      }

      await deleteObject(item.s3Key);
      await prisma.portfolioItem.delete({ where: { id: itemId } });

      res.status(200).json(successResponse({ message: 'Portfolio item deleted' }));
    } catch (err) {
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

// ── GET /barbers/nearby/feed ────────────────────────────────────────────────

router.get(
  '/nearby/feed',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lat, lng, radiusKm, page, limit } = feedQuerySchema.parse(req.query);
      const offset = (page - 1) * limit;

      const rows = await prisma.$queryRaw<FeedRow[]>`
        SELECT
          pi.id,
          pi.media_type,
          pi.cdn_url,
          pi.thumbnail_url,
          pi.caption,
          pi.like_count,
          pi.view_count,
          pi.created_at,
          bp.id AS barber_id,
          bp.user_id AS barber_user_id,
          u.full_name AS barber_full_name,
          u.avatar_url AS barber_avatar_url,
          bp.level AS barber_level,
          bp.title AS barber_title,
          bp.is_on_call AS barber_is_on_call,
          ROUND(
            (ST_Distance(
              bp.on_call_location::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
            ) / 1000.0)::numeric,
            2
          ) AS distance_km
        FROM portfolio_items pi
        JOIN barber_profiles bp ON bp.id = pi.barber_id
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
        ORDER BY pi.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const totalResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*)::bigint AS count
        FROM portfolio_items pi
        JOIN barber_profiles bp ON bp.id = pi.barber_id
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
      `;

      const total = Number(totalResult[0].count);

      const items = rows.map(row => ({
        id: row.id,
        mediaType: row.media_type,
        cdnUrl: row.cdn_url,
        thumbnailUrl: row.thumbnail_url,
        caption: row.caption,
        likeCount: Number(row.like_count),
        viewCount: Number(row.view_count),
        createdAt: row.created_at,
        barber: {
          id: row.barber_id,
          userId: row.barber_user_id,
          fullName: row.barber_full_name,
          avatarUrl: row.barber_avatar_url,
          level: row.barber_level,
          title: row.barber_title,
          isOnCall: row.barber_is_on_call,
          distanceKm: Number(row.distance_km),
        },
      }));

      res.status(200).json(successResponse({ items, total, page, limit }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /barbers/:barberId/portfolio/:itemId/like ──────────────────────────

router.post(
  '/:barberId/portfolio/:itemId/like',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { barberId, itemId } = req.params;
      const { sub: userId } = req.user!;

      if (!UUID_RE.test(barberId) || !UUID_RE.test(itemId)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid UUID format'));
        return;
      }

      const item = await prisma.portfolioItem.findFirst({
        where: { id: itemId, barberId },
      });

      if (!item) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Portfolio item not found'));
        return;
      }

      const existing = await prisma.portfolioLike.findUnique({
        where: { userId_portfolioItemId: { userId, portfolioItemId: itemId } },
      });

      if (!existing) {
        await prisma.$transaction([
          prisma.portfolioLike.create({
            data: { userId, portfolioItemId: itemId },
          }),
          prisma.portfolioItem.update({
            where: { id: itemId },
            data: { likeCount: { increment: 1 } },
          }),
        ]);
      }

      const updated = await prisma.portfolioItem.findUnique({
        where: { id: itemId },
        select: { likeCount: true },
      });

      res.status(200).json(successResponse({ liked: true, likeCount: updated!.likeCount }));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /barbers/:barberId/portfolio/:itemId/like ─────────────────────────

router.delete(
  '/:barberId/portfolio/:itemId/like',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { barberId, itemId } = req.params;
      const { sub: userId } = req.user!;

      if (!UUID_RE.test(barberId) || !UUID_RE.test(itemId)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid UUID format'));
        return;
      }

      const item = await prisma.portfolioItem.findFirst({
        where: { id: itemId, barberId },
      });

      if (!item) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Portfolio item not found'));
        return;
      }

      const existing = await prisma.portfolioLike.findUnique({
        where: { userId_portfolioItemId: { userId, portfolioItemId: itemId } },
      });

      if (existing) {
        await prisma.$transaction([
          prisma.portfolioLike.delete({
            where: { userId_portfolioItemId: { userId, portfolioItemId: itemId } },
          }),
          prisma.portfolioItem.update({
            where: { id: itemId },
            data: { likeCount: { decrement: 1 } },
          }),
        ]);
      }

      const updated = await prisma.portfolioItem.findUnique({
        where: { id: itemId },
        select: { likeCount: true },
      });

      res.status(200).json(successResponse({ liked: false, likeCount: updated!.likeCount }));
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

// ── GET /barbers/:id/portfolio ────────────────────────────────────────────────

router.get(
  '/:id/portfolio',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      if (!UUID_RE.test(id)) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      const { page, limit } = portfolioPaginationSchema.parse(req.query);
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        prisma.portfolioItem.findMany({
          where: { barberId: id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.portfolioItem.count({ where: { barberId: id } }),
      ]);

      res.status(200).json(successResponse({ items, total, page, limit }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /barbers/partnership-eligible ────────────────────────────────────────
// Must be before /:id to avoid "partnership-eligible" being parsed as id

const partnershipEligibleQuerySchema = z.object({
  q: z.string().max(100).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

router.get(
  '/partnership-eligible',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { q, limit } = partnershipEligibleQuerySchema.parse(req.query);

      const myProfile = await prisma.barberProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!myProfile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const userWhere: Prisma.UserWhereInput = {
        isActive: true,
        isBanned: false,
      };
      if (q.trim()) {
        userWhere.fullName = { contains: q.trim(), mode: 'insensitive' };
      }

      const where: Prisma.BarberProfileWhereInput = {
        id: { not: myProfile.id },
        level: { gte: 5 },
        user: userWhere,
      };

      const barbers = await prisma.barberProfile.findMany({
        where,
        take: limit,
        orderBy: { user: { fullName: 'asc' } },
        include: {
          user: { select: { fullName: true, avatarUrl: true } },
        },
      });

      const data = barbers.map((bp) => ({
        id: bp.id,
        fullName: bp.user.fullName ?? 'Unknown',
        avatarUrl: bp.user.avatarUrl,
        level: bp.level,
        title: bp.title,
      }));

      res.status(200).json(successResponse(data));
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

// ── GET /barbers/:id/reviews ────────────────────────────────────────────────

router.get(
  '/:id/reviews',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { page, limit } = portfolioPaginationSchema.parse(req.query);

      if (!UUID_RE.test(id)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid UUID format'));
        return;
      }

      const profile = await prisma.barberProfile.findUnique({ where: { id } });
      if (!profile) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      const where = {
        barberId: id,
        reviewedAt: { not: null },
      } as const;

      const [reviews, total] = await Promise.all([
        prisma.booking.findMany({
          where,
          orderBy: { reviewedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            cutRating: true,
            experienceRating: true,
            reviewText: true,
            reviewedAt: true,
            consumer: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        }),
        prisma.booking.count({ where }),
      ]);

      const mapped = reviews.map((r) => ({
        id: r.id,
        cutRating: r.cutRating,
        experienceRating: r.experienceRating,
        reviewText: r.reviewText,
        reviewedAt: r.reviewedAt,
        consumer: {
          firstName: r.consumer.fullName?.split(' ')[0] ?? 'Anonymous',
          avatarUrl: r.consumer.avatarUrl,
        },
      }));

      res.status(200).json(successResponse({ reviews: mapped, total, page, limit }));
    } catch (err) {
      next(err);
    }
  }
);

// ── Barber Services ──────────────────────────────────────────────────────────

router.get(
  '/:id/services',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid barber ID'));
        return;
      }

      const barber = await prisma.barberProfile.findUnique({ where: { id } });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      const services = await prisma.barberService.findMany({
        where: { barberId: id, isActive: true },
        orderBy: { priceCents: 'asc' },
      });

      res.status(200).json(successResponse({ services }));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/me/services',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createServiceSchema.parse(req.body);

      const barber = await prisma.barberProfile.findUnique({
        where: { userId: req.user!.sub },
      });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const service = await prisma.barberService.create({
        data: {
          barberId: barber.id,
          name: body.name,
          description: body.description,
          durationMinutes: body.durationMinutes,
          priceCents: body.priceCents,
        },
      });

      res.status(201).json(successResponse({ service }));
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/me/services/:serviceId',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { serviceId } = req.params;
      if (!UUID_RE.test(serviceId)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid service ID'));
        return;
      }

      const body = updateServiceSchema.parse(req.body);

      const barber = await prisma.barberProfile.findUnique({
        where: { userId: req.user!.sub },
      });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const existing = await prisma.barberService.findFirst({
        where: { id: serviceId, barberId: barber.id },
      });
      if (!existing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Service not found'));
        return;
      }

      const service = await prisma.barberService.update({
        where: { id: serviceId },
        data: body,
      });

      res.status(200).json(successResponse({ service }));
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/me/services/:serviceId',
  authenticate,
  requireRole('barber'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { serviceId } = req.params;
      if (!UUID_RE.test(serviceId)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid service ID'));
        return;
      }

      const barber = await prisma.barberProfile.findUnique({
        where: { userId: req.user!.sub },
      });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber profile not found'));
        return;
      }

      const existing = await prisma.barberService.findFirst({
        where: { id: serviceId, barberId: barber.id },
      });
      if (!existing) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Service not found'));
        return;
      }

      await prisma.barberService.update({
        where: { id: serviceId },
        data: { isActive: false },
      });

      res.status(200).json(successResponse({ deleted: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── Availability ─────────────────────────────────────────────────────────────

router.get(
  '/:id/availability',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        res.status(400).json(errorResponse('INVALID_ID', 'Invalid barber ID'));
        return;
      }

      const { date } = availabilityQuerySchema.parse(req.query);

      const barber = await prisma.barberProfile.findUnique({ where: { id } });
      if (!barber) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Barber not found'));
        return;
      }

      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);

      const bookings = await prisma.booking.findMany({
        where: {
          barberId: id,
          status: { in: ['pending', 'confirmed', 'in_progress'] },
          scheduledAt: { gte: startOfDay, lte: endOfDay },
        },
        select: {
          scheduledAt: true,
          durationMinutes: true,
        },
      });

      const slots = bookings.map((b) => {
        const start = new Date(b.scheduledAt);
        const end = new Date(start.getTime() + b.durationMinutes * 60 * 1000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return {
          startTime: `${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}`,
          endTime: `${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}`,
        };
      });

      res.status(200).json(successResponse({ slots }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
