import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt';
import { errorResponse, UserRole } from '../types/api';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload & { iat?: number; exp?: number };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Authorization header missing or malformed'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAccessToken(token);
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
