import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../services/prisma.service';
import {
  generateUploadPresignedUrl,
  generateDownloadUrl,
} from '../services/storage.service';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';

const router = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  eventType: z.enum(['workshop', 'live_activation', 'pop_up', 'guest_spot']),
  locationAddress: z.string().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  maxAttendees: z.number().int().min(1).optional(),
  ticketPriceCents: z.number().int().min(0).optional().default(0),
  hasFoodTrucks: z.boolean().optional().default(false),
  coverImageUrl: z.string().url().nullable().optional(),
}).refine(
  (d) => new Date(d.startsAt) < new Date(d.endsAt),
  { message: 'startsAt must be before endsAt', path: ['endsAt'] }
);

const listEventsQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(100).optional().default(50),
    type: z.enum(['workshop', 'live_activation', 'pop_up', 'guest_spot']).optional(),
    organizerId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
  })
  .refine((d) => (d.lat === undefined) === (d.lng === undefined), {
    message: 'lat and lng must both be provided or both omitted',
    path: ['lat'],
  });

const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  eventType: z.enum(['workshop', 'live_activation', 'pop_up', 'guest_spot']).optional(),
  locationAddress: z.string().min(1).max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  maxAttendees: z.number().int().min(1).optional(),
  ticketPriceCents: z.number().int().min(0).optional(),
  hasFoodTrucks: z.boolean().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  status: z.enum(['planning', 'confirmed', 'completed', 'cancelled', 'live']).optional(),
}).refine(
  (d) => {
    if (d.startsAt && d.endsAt) return new Date(d.startsAt) < new Date(d.endsAt);
    return true;
  },
  { message: 'startsAt must be before endsAt', path: ['endsAt'] }
);

// ── POST /events ──────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('studio', 'admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizerUserId = req.user!.sub;
      const body = createEventSchema.parse(req.body);

      let studioId: string | null = null;
      const studioProfile = await prisma.studioProfile.findUnique({
        where: { userId: organizerUserId },
        select: { id: true },
      });
      if (studioProfile) studioId = studioProfile.id;

      const event = await prisma.event.create({
        data: {
          organizerUserId,
          studioId,
          title: body.title,
          description: body.description ?? null,
          eventType: body.eventType,
          locationAddress: body.locationAddress,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          maxAttendees: body.maxAttendees ?? null,
          ticketPriceCents: body.ticketPriceCents ?? 0,
          hasFoodTrucks: body.hasFoodTrucks ?? false,
          coverImageUrl: body.coverImageUrl ?? null,
          status: 'planning',
        },
      });

      if (body.lat != null && body.lng != null) {
        await prisma.$executeRaw(
          Prisma.sql`
            UPDATE events
            SET location_coordinates = ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)
            WHERE id = ${event.id}::uuid
          `
        );
      }

      const created = await prisma.event.findUnique({
        where: { id: event.id },
        include: { studio: true },
      });

      res.status(201).json(successResponse(created));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /events ───────────────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = listEventsQuerySchema.parse(req.query);
      const { lat, lng, radiusKm, type, organizerId, from, to, page, limit } = query;
      const skip = (page - 1) * limit;

      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;

      if (lat != null && lng != null) {
        const rows = await prisma.$queryRaw<
          Array<{
            id: string;
            studio_id: string | null;
            organizer_user_id: string;
            title: string;
            description: string | null;
            event_type: string;
            location_address: string | null;
            google_place_id: string | null;
            cover_image_url: string | null;
            starts_at: Date;
            ends_at: Date;
            max_attendees: number | null;
            ticket_price_cents: number;
            has_food_trucks: boolean;
            status: string;
            created_at: Date;
            lat: number | null;
            lng: number | null;
            distance_km: number;
          }>
        >(Prisma.sql`
          SELECT
            e.id,
            e.studio_id,
            e.organizer_user_id,
            e.title,
            e.description,
            e.event_type,
            e.location_address,
            e.google_place_id,
            e.cover_image_url,
            e.starts_at,
            e.ends_at,
            e.max_attendees,
            e.ticket_price_cents,
            e.has_food_trucks,
            e.status,
            e.created_at,
            ST_Y(e.location_coordinates::geometry)::double precision AS lat,
            ST_X(e.location_coordinates::geometry)::double precision AS lng,
            ROUND(
              (ST_Distance(
                e.location_coordinates::geography,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
              ) / 1000.0)::numeric,
              2
            ) AS distance_km
          FROM events e
          WHERE
            e.location_coordinates IS NOT NULL
            AND ST_DWithin(
              e.location_coordinates::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${radiusKm * 1000}
            )
            AND (${type ?? null}::text IS NULL OR e.event_type = ${type ?? null})
            AND (${organizerId ?? null}::uuid IS NULL OR e.organizer_user_id = ${organizerId ?? null}::uuid)
            AND (${fromDate}::timestamptz IS NULL OR e.starts_at >= ${fromDate}::timestamptz)
            AND (${toDate}::timestamptz IS NULL OR e.ends_at <= ${toDate}::timestamptz)
            AND e.status != 'cancelled'
          ORDER BY e.starts_at ASC
          LIMIT ${limit}
          OFFSET ${skip}
        `);

        const totalResult = await prisma.$queryRaw<[{ count: bigint }]>(
          Prisma.sql`
            SELECT COUNT(*)::bigint as count
            FROM events e
            WHERE
              e.location_coordinates IS NOT NULL
              AND ST_DWithin(
                e.location_coordinates::geography,
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                ${radiusKm * 1000}
              )
              AND (${organizerId ?? null}::uuid IS NULL OR e.organizer_user_id = ${organizerId ?? null}::uuid)
              AND (${type ?? null}::text IS NULL OR e.event_type = ${type ?? null})
              AND (${fromDate}::timestamptz IS NULL OR e.starts_at >= ${fromDate}::timestamptz)
              AND (${toDate}::timestamptz IS NULL OR e.ends_at <= ${toDate}::timestamptz)
              AND e.status != 'cancelled'
          `
        );
        const total = Number(totalResult[0]?.count ?? 0);

        const events = rows.map((r) => ({
          id: r.id,
          studioId: r.studio_id,
          organizerUserId: r.organizer_user_id,
          title: r.title,
          description: r.description,
          eventType: r.event_type,
          locationAddress: r.location_address,
          googlePlaceId: r.google_place_id,
          coverImageUrl: r.cover_image_url,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          maxAttendees: r.max_attendees,
          ticketPriceCents: r.ticket_price_cents,
          hasFoodTrucks: r.has_food_trucks,
          status: r.status,
          createdAt: r.created_at,
          lat: r.lat,
          lng: r.lng,
          distanceKm: Number(r.distance_km),
        }));

        res.status(200).json(
          successResponse(events, {
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
          })
        );
      } else {
        const listRows = await prisma.$queryRaw<
          Array<{
            id: string;
            studio_id: string | null;
            organizer_user_id: string;
            title: string;
            description: string | null;
            event_type: string;
            location_address: string | null;
            google_place_id: string | null;
            cover_image_url: string | null;
            starts_at: Date;
            ends_at: Date;
            max_attendees: number | null;
            ticket_price_cents: number;
            has_food_trucks: boolean;
            status: string;
            created_at: Date;
            lat: number | null;
            lng: number | null;
          }>
        >(Prisma.sql`
          SELECT
            e.id,
            e.studio_id,
            e.organizer_user_id,
            e.title,
            e.description,
            e.event_type,
            e.location_address,
            e.google_place_id,
            e.cover_image_url,
            e.starts_at,
            e.ends_at,
            e.max_attendees,
            e.ticket_price_cents,
            e.has_food_trucks,
            e.status,
            e.created_at,
            ST_Y(e.location_coordinates::geometry)::double precision AS lat,
            ST_X(e.location_coordinates::geometry)::double precision AS lng
          FROM events e
          WHERE
            e.status != 'cancelled'
            AND (${organizerId ?? null}::uuid IS NULL OR e.organizer_user_id = ${organizerId ?? null}::uuid)
            AND (${type ?? null}::text IS NULL OR e.event_type = ${type ?? null})
            AND (${fromDate}::timestamptz IS NULL OR e.starts_at >= ${fromDate}::timestamptz)
            AND (${toDate}::timestamptz IS NULL OR e.ends_at <= ${toDate}::timestamptz)
          ORDER BY e.starts_at ASC
          LIMIT ${limit}
          OFFSET ${skip}
        `);

        const countResult = await prisma.$queryRaw<[{ count: bigint }]>(
          Prisma.sql`
            SELECT COUNT(*)::bigint as count
            FROM events e
            WHERE
              e.status != 'cancelled'
              AND (${organizerId ?? null}::uuid IS NULL OR e.organizer_user_id = ${organizerId ?? null}::uuid)
              AND (${type ?? null}::text IS NULL OR e.event_type = ${type ?? null})
              AND (${fromDate}::timestamptz IS NULL OR e.starts_at >= ${fromDate}::timestamptz)
              AND (${toDate}::timestamptz IS NULL OR e.ends_at <= ${toDate}::timestamptz)
          `
        );
        const total = Number(countResult[0]?.count ?? 0);

        const events = listRows.map((r) => ({
          id: r.id,
          studioId: r.studio_id,
          organizerUserId: r.organizer_user_id,
          title: r.title,
          description: r.description,
          eventType: r.event_type,
          locationAddress: r.location_address,
          googlePlaceId: r.google_place_id,
          coverImageUrl: r.cover_image_url,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          maxAttendees: r.max_attendees,
          ticketPriceCents: r.ticket_price_cents,
          hasFoodTrucks: r.has_food_trucks,
          status: r.status,
          createdAt: r.created_at,
          lat: r.lat,
          lng: r.lng,
        }));

        res.status(200).json(
          successResponse(events, {
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
          })
        );
      }
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /events/:id ───────────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          studio: { include: { user: { select: { avatarUrl: true } } } },
          organizer: { select: { fullName: true, avatarUrl: true } },
          _count: { select: { attendees: true } },
        },
      });

      if (!event) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Event not found'));
        return;
      }

      const [coordRow, attendeeRows] = await Promise.all([
        prisma.$queryRaw<
          Array<{ lat: number | null; lng: number | null }>
        >(Prisma.sql`
          SELECT
            ST_Y(e.location_coordinates::geometry)::double precision AS lat,
            ST_X(e.location_coordinates::geometry)::double precision AS lng
          FROM events e
          WHERE e.id = ${id}::uuid
        `),
        prisma.eventAttendee.findMany({
          where: { eventId: id },
          take: 5,
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, avatarUrl: true, fullName: true } } },
        }),
      ]);

      const coords = coordRow[0];
      const attendees = attendeeRows.map((a) => ({
        userId: a.user.id,
        avatarUrl: a.user.avatarUrl,
        firstName: a.user.fullName.split(' ')[0] ?? a.user.fullName,
      }));

      const { _count, ...rest } = event;
      res.status(200).json(
        successResponse({
          ...rest,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          attendeeCount: _count.attendees,
          attendees,
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /events/:id/attend ───────────────────────────────────────────────────

router.post(
  '/:id/attend',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id: eventId } = req.params;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { _count: { select: { attendees: true } } },
      });

      if (!event) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Event not found'));
        return;
      }

      if (event.status === 'cancelled') {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Event is cancelled'));
        return;
      }

      if (
        event.maxAttendees != null &&
        event._count.attendees >= event.maxAttendees
      ) {
        res.status(422).json(errorResponse('UNPROCESSABLE', 'Event is at capacity'));
        return;
      }

      await prisma.eventAttendee.upsert({
        where: {
          eventId_userId: { eventId, userId },
        },
        create: { eventId, userId },
        update: {},
      });

      res.status(200).json(successResponse({ registered: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /events/:id/attend ─────────────────────────────────────────────────

router.delete(
  '/:id/attend',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id: eventId } = req.params;

      await prisma.eventAttendee.deleteMany({
        where: { eventId, userId },
      });

      res.status(200).json(successResponse({ removed: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /events/:id/cover-image-upload-url ───────────────────────────────────

const coverImageUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

router.post(
  '/:id/cover-image-upload-url',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const userRole = req.user!.role;
      const { id: eventId } = req.params;
      const { fileName, mimeType } = coverImageUploadSchema.parse(req.body);

      const event = await prisma.event.findUnique({ where: { id: eventId } });
      if (!event) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Event not found'));
        return;
      }

      if (event.organizerUserId !== userId && userRole !== 'admin') {
        res.status(403).json(
          errorResponse('FORBIDDEN', 'Only the organizer or admin can upload cover image')
        );
        return;
      }

      const dotIdx = fileName.lastIndexOf('.');
      const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '.jpg';
      const uuid = crypto.randomUUID();
      const key = `events/${eventId}/${uuid}${ext}`;

      const uploadUrl = await generateUploadPresignedUrl(key, mimeType, 5);
      const cdnUrl = generateDownloadUrl(key);

      res.status(200).json(successResponse({ uploadUrl, key, cdnUrl }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /events/:id ─────────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const body = updateEventSchema.parse(req.body);

      const event = await prisma.event.findUnique({
        where: { id },
      });

      if (!event) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Event not found'));
        return;
      }

      if (event.organizerUserId !== userId) {
        res.status(403).json(errorResponse('FORBIDDEN', 'Only the organizer can update this event'));
        return;
      }

      if (body.status === 'live') {
        res.status(422).json(
          errorResponse('UNPROCESSABLE', 'Cannot set status to live directly')
        );
        return;
      }

      const updateData: Prisma.EventUpdateInput = {
        ...(body.status != null && { status: body.status }),
        ...(body.title != null && { title: body.title }),
        ...(body.description != null && { description: body.description }),
        ...(body.eventType != null && { eventType: body.eventType }),
        ...(body.locationAddress != null && { locationAddress: body.locationAddress }),
        ...(body.startsAt != null && { startsAt: new Date(body.startsAt) }),
        ...(body.endsAt != null && { endsAt: new Date(body.endsAt) }),
        ...(body.maxAttendees != null && { maxAttendees: body.maxAttendees }),
        ...(body.ticketPriceCents != null && { ticketPriceCents: body.ticketPriceCents }),
        ...(body.hasFoodTrucks != null && { hasFoodTrucks: body.hasFoodTrucks }),
        ...(body.coverImageUrl !== undefined && { coverImageUrl: body.coverImageUrl }),
      };

      const updated = await prisma.event.update({
        where: { id },
        data: updateData,
        include: { studio: true },
      });

      if (body.lat != null && body.lng != null) {
        await prisma.$executeRaw(
          Prisma.sql`
            UPDATE events
            SET location_coordinates = ST_SetSRID(ST_MakePoint(${body.lng}, ${body.lat}), 4326)
            WHERE id = ${id}::uuid
          `
        );
      }

      res.status(200).json(successResponse(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
