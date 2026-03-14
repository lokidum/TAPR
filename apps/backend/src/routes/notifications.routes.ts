import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.service';
import { authenticate } from '../middleware/auth.middleware';
import { errorResponse, successResponse } from '../types/api';

const router = Router();

const registerDeviceSchema = z.object({
  pushToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── POST /notifications/register-device ───────────────────────────────────────

router.post(
  '/register-device',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { pushToken, platform } = registerDeviceSchema.parse(req.body);

      await prisma.deviceToken.upsert({
        where: { token: pushToken },
        create: { userId, token: pushToken, platform },
        update: { userId, platform },
      });

      res.status(200).json(successResponse({ registered: true }));
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /notifications ─────────────────────────────────────────────────────────

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
      const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, parseInt(String(req.query.limit ?? DEFAULT_PAGE_SIZE), 10))
      );
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.notification.count({ where: { userId } }),
      ]);

      res.status(200).json(
        successResponse(notifications, {
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /notifications/unread-count ───────────────────────────────────────────
// Must be before /:id/read to avoid "unread-count" being captured as id

router.get(
  '/unread-count',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;

      const count = await prisma.notification.count({
        where: { userId, isRead: false },
      });

      res.status(200).json(successResponse({ count }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /notifications/read-all ──────────────────────────────────────────────
// Must be before /:id/read to avoid "read-all" being captured as id

router.patch(
  '/read-all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;

      const result = await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });

      res.status(200).json(successResponse({ updated: result.count }));
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /notifications/:id/read ──────────────────────────────────────────────

router.patch(
  '/:id/read',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;

      const notification = await prisma.notification.findFirst({
        where: { id, userId },
      });

      if (!notification) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Notification not found'));
        return;
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      res.status(200).json(successResponse({ updated: true }));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
