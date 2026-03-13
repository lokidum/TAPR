import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { errors as joseErrors } from 'jose';
import { prisma } from '../services/prisma.service';
import { sendSMS } from '../services/twilio.service';
import { verifyAppleIdentityToken } from '../services/apple.service';
import { verifyGoogleIdToken, InvalidGoogleTokenError } from '../services/google.service';
import {
  incrementRateLimit,
  setOTP,
  getOTP,
  deleteOTP,
  setRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens,
} from '../services/redis.service';
import { signAccessToken, signRefreshToken, verifyAccessToken } from '../utils/jwt';
import { errorResponse, successResponse, UserRole } from '../types/api';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

const BCRYPT_ROUNDS = 10;
const OTP_TTL_SECONDS = 300;
const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW_SECONDS = 600;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ── Zod schemas ───────────────────────────────────────────────────────────────

const phoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
});

const otpVerifySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

const appleSchema = z.object({
  identityToken: z.string().min(1),
  fullName: z.string().optional(),
});

const googleSchema = z.object({
  idToken: z.string().min(1),
});

// ── Shared helpers ────────────────────────────────────────────────────────────

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'strict', path: '/' });
}

async function issueTokenPair(
  user: { id: string; role: UserRole; barberProfile?: { level: number } | null },
  res: Response
): Promise<string> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    ...(user.barberProfile ? { level: user.barberProfile.level } : {}),
  });
  const refreshToken = signRefreshToken();
  await setRefreshToken(refreshToken, user.id, REFRESH_TOKEN_TTL_SECONDS);
  setRefreshCookie(res, refreshToken);
  return accessToken;
}

// ── POST /auth/otp/request ────────────────────────────────────────────────────

router.post(
  '/otp/request',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = phoneSchema.parse(req.body);

      const count = await incrementRateLimit(`otp:${phone}`, OTP_RATE_WINDOW_SECONDS);
      if (count > OTP_RATE_LIMIT) {
        res.status(429).json(
          errorResponse('RATE_LIMITED', 'Too many OTP requests. Try again in 10 minutes.')
        );
        return;
      }

      const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
      const hashedOTP = await bcrypt.hash(otp, BCRYPT_ROUNDS);

      await setOTP(phone, hashedOTP, OTP_TTL_SECONDS);
      await sendSMS(phone, `Your TAPR verification code is: ${otp}. Valid for 5 minutes.`);

      res.status(200).json(successResponse({ message: 'OTP sent' }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/otp/verify ─────────────────────────────────────────────────────

router.post(
  '/otp/verify',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = otpVerifySchema.parse(req.body);

      const hashedOTP = await getOTP(phone);
      if (!hashedOTP) {
        res.status(401).json(errorResponse('OTP_EXPIRED', 'OTP has expired or was never sent'));
        return;
      }

      const isValid = await bcrypt.compare(otp, hashedOTP);
      if (!isValid) {
        res.status(401).json(errorResponse('OTP_INVALID', 'Incorrect OTP'));
        return;
      }

      await deleteOTP(phone);

      const user = await prisma.user.upsert({
        where: { phone },
        update: {},
        create: {
          phone,
          fullName: phone,
          role: 'barber',
          barberProfile: { create: { level: 1, title: 'Novice' } },
        },
        include: { barberProfile: true },
      });

      const accessToken = await issueTokenPair(user, res);

      res.status(200).json(
        successResponse({ accessToken, user: { id: user.id, phone: user.phone, role: user.role } })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/apple ──────────────────────────────────────────────────────────

router.post(
  '/apple',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityToken, fullName } = appleSchema.parse(req.body);

      let claims: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
      try {
        claims = await verifyAppleIdentityToken(identityToken);
      } catch (err) {
        if (err instanceof joseErrors.JWTExpired || err instanceof joseErrors.JWTInvalid ||
            err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWSSignatureVerificationFailed) {
          res.status(401).json(errorResponse('INVALID_TOKEN', 'Apple identity token is invalid'));
          return;
        }
        throw err;
      }

      const user = await prisma.user.upsert({
        where: { appleUserId: claims.sub },
        update: {},
        create: {
          appleUserId: claims.sub,
          email: claims.email,
          fullName: fullName ?? claims.email ?? claims.sub,
          role: 'consumer',
        },
        include: { barberProfile: true },
      });

      const accessToken = await issueTokenPair(user, res);

      res.status(200).json(
        successResponse({ accessToken, user: { id: user.id, email: user.email, role: user.role } })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/google ─────────────────────────────────────────────────────────

router.post(
  '/google',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idToken } = googleSchema.parse(req.body);

      let claims: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
      try {
        claims = await verifyGoogleIdToken(idToken);
      } catch (err) {
        if (err instanceof InvalidGoogleTokenError) {
          res.status(401).json(errorResponse('INVALID_TOKEN', err.message));
          return;
        }
        throw err;
      }

      const user = await prisma.user.upsert({
        where: { googleUserId: claims.sub },
        update: {},
        create: {
          googleUserId: claims.sub,
          email: claims.email,
          fullName: claims.name,
          avatarUrl: claims.picture,
          role: 'consumer',
        },
        include: { barberProfile: true },
      });

      const accessToken = await issueTokenPair(user, res);

      res.status(200).json(
        successResponse({ accessToken, user: { id: user.id, email: user.email, role: user.role } })
      );
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/refresh ────────────────────────────────────────────────────────

router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Accept from cookie or Authorization header
      const token: string | undefined =
        (req.cookies as Record<string, string | undefined>)['refresh_token'] ??
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        res.status(401).json(errorResponse('UNAUTHORIZED', 'Refresh token missing'));
        return;
      }

      const userId = await getRefreshToken(token);
      if (!userId) {
        res.status(401).json(errorResponse('INVALID_TOKEN', 'Refresh token is invalid or expired'));
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { barberProfile: true },
      });

      if (!user) {
        res.status(401).json(errorResponse('UNAUTHORIZED', 'User not found'));
        return;
      }

      // Rotate: delete old, issue new
      await deleteRefreshToken(token);
      const accessToken = await issueTokenPair(user, res);

      res.status(200).json(successResponse({ accessToken }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/logout ─────────────────────────────────────────────────────────

router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = (req.cookies as Record<string, string | undefined>)['refresh_token'];
      if (token) {
        await deleteRefreshToken(token);
      }
      clearRefreshCookie(res);
      res.status(200).json(successResponse({ message: 'Logged out' }));
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /auth/sessions/all ─────────────────────────────────────────────────

router.delete(
  '/sessions/all',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      await deleteAllUserTokens(userId);
      clearRefreshCookie(res);
      res.status(200).json(successResponse({ message: 'All sessions revoked' }));
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /auth/refresh (token rotation also validates the access token) ───────
// Expose verifyAccessToken for internal use by the refresh flow
export { verifyAccessToken };

export default router;
