import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt';
import { getBanned, setBanned } from '../services/redis.service';
import { prisma } from '../services/prisma.service';
import { errorResponse, UserRole } from '../types/api';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload & { iat?: number; exp?: number };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Authorization header missing or malformed'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAccessToken(token);
    const userId = req.user.sub;

    const cachedBanned = await getBanned(userId);
    if (cachedBanned) {
      res.status(403).json(errorResponse('USER_BANNED', 'User account has been banned'));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true },
    });
    if (user?.isBanned) {
      await setBanned(userId);
      res.status(403).json(errorResponse('USER_BANNED', 'User account has been banned'));
      return;
    }

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(403).json(errorResponse('TOKEN_EXPIRED', 'Access token has expired'));
      return;
    }
    res.status(401).json(errorResponse('INVALID_TOKEN', 'Access token is invalid'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json(errorResponse('FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
      return;
    }

    next();
  };
}
