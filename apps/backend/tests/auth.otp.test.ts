jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/twilio.service');
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: {
      upsert: jest.fn(),
    },
  },
}));
jest.mock('bcrypt');
jest.mock('../src/services/redis.service', () => ({
  incrementRateLimit: jest.fn(),
  setOTP: jest.fn(),
  getOTP: jest.fn(),
  deleteOTP: jest.fn(),
  setRefreshToken: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { prisma } from '../src/services/prisma.service';
import { sendSMS } from '../src/services/twilio.service';
import * as redisService from '../src/services/redis.service';
import authRouter from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/errorHandler';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockBcryptHash = bcrypt.hash as jest.Mock;
const mockBcryptCompare = bcrypt.compare as jest.Mock;
const mockUpsert = (prisma.user as jest.Mocked<typeof prisma.user>).upsert as jest.Mock;
const mockSendSMS = sendSMS as jest.MockedFunction<typeof sendSMS>;
const mockIncrementRateLimit = redisService.incrementRateLimit as jest.Mock;
const mockSetOTP = redisService.setOTP as jest.Mock;
const mockGetOTP = redisService.getOTP as jest.Mock;
const mockDeleteOTP = redisService.deleteOTP as jest.Mock;
const mockSetRefreshToken = redisService.setRefreshToken as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRouter);
  app.use(errorHandler);
  return app;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-32-chars-exactly-padded!!';
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSendSMS.mockResolvedValue(undefined);
  mockSetOTP.mockResolvedValue(undefined);
  mockDeleteOTP.mockResolvedValue(undefined);
  mockSetRefreshToken.mockResolvedValue(undefined);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_PHONE = '+61400000001';
const TEST_OTP = '123456';
const HASHED_OTP = '$2b$10$hashedotpvalue';

const MOCK_USER = {
  id: 'user-uuid-1',
  phone: TEST_PHONE,
  role: 'barber' as const,
  fullName: TEST_PHONE,
  email: null,
  appleUserId: null,
  googleUserId: null,
  avatarUrl: null,
  isActive: true,
  isBanned: false,
  banReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  barberProfile: { level: 1, title: 'Novice' },
};

// ── POST /auth/otp/request ────────────────────────────────────────────────────

describe('POST /api/v1/auth/otp/request', () => {
  beforeEach(() => {
    mockIncrementRateLimit.mockResolvedValue(1);
    mockBcryptHash.mockResolvedValue(HASHED_OTP);
  });

  it('returns 200 and sends OTP for valid E.164 phone', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/otp/request')
      .send({ phone: TEST_PHONE });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toBe('OTP sent');
    expect(mockSendSMS).toHaveBeenCalledWith(TEST_PHONE, expect.stringContaining('TAPR'));
  });

  it('hashes the OTP and stores it in Redis', async () => {
    await request(buildApp())
      .post('/api/v1/auth/otp/request')
      .send({ phone: TEST_PHONE });

    expect(mockBcryptHash).toHaveBeenCalledWith(expect.any(String), 10);
    expect(mockSetOTP).toHaveBeenCalledWith(TEST_PHONE, HASHED_OTP, 300);
  });

  it('returns 400 for invalid phone format (missing country code)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '0400000001' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockSendSMS).not.toHaveBeenCalled();
  });

  it('returns 400 when phone is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/otp/request')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    mockIncrementRateLimit.mockResolvedValue(4); // already over limit

    const res = await request(buildApp())
      .post('/api/v1/auth/otp/request')
      .send({ phone: TEST_PHONE });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(mockSendSMS).not.toHaveBeenCalled();
    expect(mockSetOTP).not.toHaveBeenCalled();
  });

  it('allows exactly 3 requests before rate limiting', async () => {
    const app = buildApp();

    for (let count = 1; count <= 3; count++) {
      mockIncrementRateLimit.mockResolvedValueOnce(count);
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ phone: TEST_PHONE });
      expect(res.status).toBe(200);
    }

    mockIncrementRateLimit.mockResolvedValueOnce(4);
    const res = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone: TEST_PHONE });
    expect(res.status).toBe(429);
  });
});

// ── POST /auth/otp/verify ─────────────────────────────────────────────────────

describe('POST /api/v1/auth/otp/verify', () => {
  beforeEach(() => {
    mockGetOTP.mockResolvedValue(HASHED_OTP);
    mockBcryptCompare.mockResolvedValue(true);
    mockUpsert.mockResolvedValue(MOCK_USER);
  });

  it('returns 200 with accessToken and sets HttpOnly refresh cookie on success', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, otp: TEST_OTP });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user).toMatchObject({
      id: MOCK_USER.id,
      phone: TEST_PHONE,
      role: 'barber',
    });
    // HttpOnly cookie set
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('refresh_token=');
    expect(cookie).toContain('HttpOnly');
  });

  it('deletes the OTP from Redis after successful verify', async () => {
    await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, otp: TEST_OTP });

    expect(mockDeleteOTP).toHaveBeenCalledWith(TEST_PHONE);
  });

  it('stores the refresh token in Redis with 30-day TTL', async () => {
    await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, otp: TEST_OTP });

    expect(mockSetRefreshToken).toHaveBeenCalledWith(
      expect.any(String),
      MOCK_USER.id,
      2592000
    );
  });

  it('returns 401 INVALID_TOKEN for wrong OTP', async () => {
    mockBcryptCompare.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, otp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_INVALID');
    expect(mockDeleteOTP).not.toHaveBeenCalled();
  });

  it('returns 401 OTP_EXPIRED when OTP not found in Redis', async () => {
    mockGetOTP.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, otp: TEST_OTP });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
    expect(mockBcryptCompare).not.toHaveBeenCalled();
  });

  it('returns 401 OTP_EXPIRED for a phone that never requested an OTP', async () => {
    mockGetOTP.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+61400009999', otp: TEST_OTP });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('returns 400 for OTP that is not 6 digits', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: TEST_PHONE, otp: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockGetOTP).not.toHaveBeenCalled();
  });
});
