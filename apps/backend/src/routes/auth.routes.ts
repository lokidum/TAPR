import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../services/prisma.service';
import { sendSMS } from '../services/twilio.service';
import {
  incrementRateLimit,
  setOTP,
  getOTP,
  deleteOTP,
  setRefreshToken,
} from '../services/redis.service';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { errorResponse, successResponse } from '../types/api';

const router = Router();

const BCRYPT_ROUNDS = 10;
const OTP_TTL_SECONDS = 300;
const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW_SECONDS = 600;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const phoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
});

const verifySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

// POST /auth/otp/request
router.post(
  '/otp/request',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone } = phoneSchema.parse(req.body);

      const count = await incrementRateLimit(`otp:${phone}`, OTP_RATE_WINDOW_SECONDS);
      if (count > OTP_RATE_LIMIT) {
        res
          .status(429)
          .json(errorResponse('RATE_LIMITED', 'Too many OTP requests. Try again in 10 minutes.'));
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

// POST /auth/otp/verify
router.post(
  '/otp/verify',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone, otp } = verifySchema.parse(req.body);

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

      const accessToken = signAccessToken({
        sub: user.id,
        role: user.role,
        ...(user.barberProfile ? { level: user.barberProfile.level } : {}),
      });

      const refreshToken = signRefreshToken();
      await setRefreshToken(refreshToken, user.id, REFRESH_TOKEN_TTL_SECONDS);

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
        maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
        path: '/',
      });

      res.status(200).json(
        successResponse({
          accessToken,
          user: { id: user.id, phone: user.phone, role: user.role },
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;
