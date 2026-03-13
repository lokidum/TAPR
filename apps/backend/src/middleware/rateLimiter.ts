import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../types/api';
import logger from '../utils/logger';

// Placeholder rate limiter — replace with Redis sliding window in production
// Redis client will be injected via app startup

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function getRateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = memoryStore.get(key);

    if (!entry || entry.resetAt < now) {
      memoryStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;

    if (entry.count > limit) {
      logger.warn('Rate limit exceeded', { ip: key, path: req.path });
      res.status(429).json(errorResponse('RATE_LIMITED', 'Too many requests. Please try again later.'));
      return;
    }

    next();
  };
}

export const unauthenticatedLimiter = getRateLimiter(20, 60_000);
export const authenticatedLimiter = getRateLimiter(200, 60_000);
export const otpLimiter = getRateLimiter(3, 600_000);
