jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/apple.service');
jest.mock('../src/services/google.service');
jest.mock('../src/services/twilio.service');
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));
jest.mock('../src/services/redis.service', () => ({
  incrementRateLimit: jest.fn(),
  setOTP: jest.fn(),
  getOTP: jest.fn(),
  deleteOTP: jest.fn(),
  setRefreshToken: jest.fn(),
  getRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn(),
  deleteAllUserTokens: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { errors as joseErrors } from 'jose';
import { verifyAppleIdentityToken } from '../src/services/apple.service';
import { verifyGoogleIdToken, InvalidGoogleTokenError } from '../src/services/google.service';
import { prisma } from '../src/services/prisma.service';
import * as redisService from '../src/services/redis.service';
import authRouter from '../src/routes/auth.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockVerifyApple = verifyAppleIdentityToken as jest.MockedFunction<typeof verifyAppleIdentityToken>;
const mockVerifyGoogle = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;
const mockUpsert = (prisma.user as jest.Mocked<typeof prisma.user>).upsert as jest.Mock;
const mockFindUnique = (prisma.user as jest.Mocked<typeof prisma.user>).findUnique as jest.Mock;
const mockSetRefreshToken = redisService.setRefreshToken as jest.Mock;
const mockGetRefreshToken = redisService.getRefreshToken as jest.Mock;
const mockDeleteRefreshToken = redisService.deleteRefreshToken as jest.Mock;
const mockDeleteAllUserTokens = redisService.deleteAllUserTokens as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSetRefreshToken.mockResolvedValue(undefined);
  mockDeleteRefreshToken.mockResolvedValue(undefined);
  mockDeleteAllUserTokens.mockResolvedValue(undefined);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONSUMER_USER = {
  id: 'consumer-uuid',
  email: 'user@example.com',
  phone: null,
  role: 'consumer' as const,
  fullName: 'Test User',
  appleUserId: null,
  googleUserId: null,
  avatarUrl: null,
  isActive: true,
  isBanned: false,
  banReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  barberProfile: null,
};

function validAccessToken(userId = 'consumer-uuid', role = 'consumer'): string {
  return signAccessToken({ sub: userId, role: role as 'consumer' });
}

// ── POST /auth/apple ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/apple', () => {
  beforeEach(() => {
    mockVerifyApple.mockResolvedValue({ sub: 'apple-sub-123', email: 'user@privaterelay.appleid.com' });
    mockUpsert.mockResolvedValue(CONSUMER_USER);
  });

  it('returns 200 with tokens for a valid Apple identity token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'valid.apple.token', fullName: 'Test User' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.role).toBe('consumer');
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('HttpOnly');
  });

  it('passes fullName to upsert on first login', async () => {
    await request(buildApp())
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'valid.apple.token', fullName: 'Jordan Smith' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ fullName: 'Jordan Smith' }),
      })
    );
  });

  it('upserts with appleUserId as the where key', async () => {
    await request(buildApp())
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'valid.apple.token' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { appleUserId: 'apple-sub-123' } })
    );
  });

  it('returns 401 for an invalid Apple token (JWSSignatureVerificationFailed)', async () => {
    mockVerifyApple.mockRejectedValue(new joseErrors.JWSSignatureVerificationFailed());

    const res = await request(buildApp())
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'bad.token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 for an expired Apple token (JWTExpired)', async () => {
    mockVerifyApple.mockRejectedValue(new joseErrors.JWTExpired('JWT expired', {}));

    const res = await request(buildApp())
      .post('/api/v1/auth/apple')
      .send({ identityToken: 'expired.token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 400 when identityToken is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/apple')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── POST /auth/google ─────────────────────────────────────────────────────────

describe('POST /api/v1/auth/google', () => {
  beforeEach(() => {
    mockVerifyGoogle.mockResolvedValue({
      sub: 'google-sub-456',
      email: 'user@gmail.com',
      name: 'Test User',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    });
    mockUpsert.mockResolvedValue(CONSUMER_USER);
  });

  it('returns 200 with tokens for a valid Google ID token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid.google.token' });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.role).toBe('consumer');
  });

  it('upserts with googleUserId as the where key', async () => {
    await request(buildApp())
      .post('/api/v1/auth/google')
      .send({ idToken: 'valid.google.token' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { googleUserId: 'google-sub-456' } })
    );
  });

  it('returns 401 when Google rejects the token', async () => {
    mockVerifyGoogle.mockRejectedValue(new InvalidGoogleTokenError('Google rejected the ID token'));

    const res = await request(buildApp())
      .post('/api/v1/auth/google')
      .send({ idToken: 'bad.token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when aud does not match GOOGLE_CLIENT_ID', async () => {
    mockVerifyGoogle.mockRejectedValue(
      new InvalidGoogleTokenError('Google token audience does not match GOOGLE_CLIENT_ID')
    );

    const res = await request(buildApp())
      .post('/api/v1/auth/google')
      .send({ idToken: 'wrong-aud.token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 400 when idToken is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/google')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    mockGetRefreshToken.mockResolvedValue('consumer-uuid');
    mockFindUnique.mockResolvedValue(CONSUMER_USER);
  });

  it('returns 200 with a new access token when cookie is valid', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=valid-refresh-token');

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(mockDeleteRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    expect(mockSetRefreshToken).toHaveBeenCalledWith(
      expect.any(String), 'consumer-uuid', 2592000
    );
  });

  it('accepts refresh token from Authorization header', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/refresh')
      .set('Authorization', 'Bearer valid-refresh-token');

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('sets a new HttpOnly cookie with the rotated token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=valid-refresh-token');

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('refresh_token=');
    expect(cookie).toContain('HttpOnly');
  });

  it('rotates the token: old one deleted, new one stored', async () => {
    await request(buildApp())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=old-token');

    expect(mockDeleteRefreshToken).toHaveBeenCalledWith('old-token');
    const newToken = mockSetRefreshToken.mock.calls[0]?.[0] as string;
    expect(newToken).not.toBe('old-token');
    expect(newToken).toMatch(/^[0-9a-f]{128}$/);
  });

  it('returns 401 when refresh token is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when refresh token is not in Redis', async () => {
    mockGetRefreshToken.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=unknown-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 401 when user is not found in DB', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=valid-refresh-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('returns 200, deletes refresh token, and clears cookie', async () => {
    const token = validAccessToken();
    const res = await request(buildApp())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', 'refresh_token=my-refresh-token');

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Logged out');
    expect(mockDeleteRefreshToken).toHaveBeenCalledWith('my-refresh-token');
    // Cookie cleared
    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toContain('refresh_token=;');
  });

  it('returns 200 even when no refresh cookie is present', async () => {
    const token = validAccessToken();
    const res = await request(buildApp())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(mockDeleteRefreshToken).not.toHaveBeenCalled();
  });

  it('returns 401 when no access token is provided', async () => {
    const res = await request(buildApp())
      .post('/api/v1/auth/logout');

    expect(res.status).toBe(401);
  });
});

// ── DELETE /auth/sessions/all ─────────────────────────────────────────────────

describe('DELETE /api/v1/auth/sessions/all', () => {
  it('returns 200 and revokes all user sessions', async () => {
    const token = validAccessToken('consumer-uuid');
    const res = await request(buildApp())
      .delete('/api/v1/auth/sessions/all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('All sessions revoked');
    expect(mockDeleteAllUserTokens).toHaveBeenCalledWith('consumer-uuid');
  });

  it('clears the refresh cookie', async () => {
    const token = validAccessToken();
    const res = await request(buildApp())
      .delete('/api/v1/auth/sessions/all')
      .set('Authorization', `Bearer ${token}`);

    const setCookie = res.headers['set-cookie']?.[0] ?? '';
    expect(setCookie).toContain('refresh_token=;');
  });

  it('returns 401 with no access token', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/auth/sessions/all');

    expect(res.status).toBe(401);
    expect(mockDeleteAllUserTokens).not.toHaveBeenCalled();
  });
});
