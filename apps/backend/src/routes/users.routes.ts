import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.service';
import { deleteAllUserTokens } from '../services/redis.service';
import {
  generateUploadPresignedUrl,
  generateDownloadUrl,
} from '../services/storage.service';
import { authenticate } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();

const avatarUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

const updateMeSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripBarberTokens<T extends { instagramAccessToken?: unknown; tiktokAccessToken?: unknown }>(
  profile: T
): Omit<T, 'instagramAccessToken' | 'tiktokAccessToken'> {
  const { instagramAccessToken: _i, tiktokAccessToken: _t, ...safe } = profile;
  return safe;
}

// ── GET /users/me ─────────────────────────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: id, role } = req.user!;

      const include =
        role === 'barber'
          ? { barberProfile: true }
          : role === 'studio'
          ? { studioProfile: true }
          : {};

      const user = await prisma.user.findUnique({ where: { id }, include });

      if (!user) {
        res.status(404).json(errorResponse('NOT_FOUND', 'User not found'));
        return;
      }

      const { barberProfile, ...rest } = user as typeof user & {
        barberProfile?: Record<string, unknown> | null;
        studioProfile?: Record<string, unknown> | null;
      };

      const safeUser = {
        ...rest,
        ...(barberProfile ? { barberProfile: stripBarberTokens(barberProfile) } : {}),
      };

      res.status(200).json(successResponse(safeUser));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /users/me/avatar-upload-url ──────────────────────────────────────────

router.post(
  '/me/avatar-upload-url',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: userId } = req.user!;
      const { fileName, mimeType } = avatarUploadSchema.parse(req.body);

      const dotIdx = fileName.lastIndexOf('.');
      const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '.jpg';
      const uuid = crypto.randomUUID();
      const key = `avatars/${userId}/${uuid}${ext}`;

      const uploadUrl = await generateUploadPresignedUrl(key, mimeType, 5);
      const cdnUrl = generateDownloadUrl(key);

      res.status(200).json(successResponse({ uploadUrl, key, cdnUrl }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /users/me ───────────────────────────────────────────────────────────

router.patch(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: id, role } = req.user!;
      const data = updateMeSchema.parse(req.body);

      const include =
        role === 'barber'
          ? { barberProfile: true }
          : role === 'studio'
          ? { studioProfile: true }
          : {};

      const user = await prisma.user.update({ where: { id }, data, include });

      const { barberProfile, ...rest } = user as typeof user & {
        barberProfile?: Record<string, unknown> | null;
      };

      const safeUser = {
        ...rest,
        ...(barberProfile ? { barberProfile: stripBarberTokens(barberProfile) } : {}),
      };

      res.status(200).json(successResponse(safeUser));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /users/:id/public ─────────────────────────────────────────────────────

router.get(
  '/:id/public',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
          isActive: true,
          isBanned: true,
        },
      });

      if (!user || user.isBanned || !user.isActive) {
        res.status(404).json(errorResponse('NOT_FOUND', 'User not found'));
        return;
      }

      const { isActive: _a, isBanned: _b, ...publicData } = user;
      res.status(200).json(successResponse(publicData));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /users/me ──────────────────────────────────────────────────────────

router.delete(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sub: id } = req.user!;

      await prisma.user.update({
        where: { id },
        data: {
          email: `deleted_${id}@deleted.com`,
          phone: null,
          fullName: 'Deleted User',
          isActive: false,
          avatarUrl: null,
          appleUserId: null,
          googleUserId: null,
        },
      });

      await deleteAllUserTokens(id);

      logger.info('S3 cleanup job would be enqueued', { userId: id });

      res.status(200).json(successResponse({ message: 'Account deleted' }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
