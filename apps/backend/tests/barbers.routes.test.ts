jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    barberProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));
jest.mock('../src/services/redis.service', () => ({
  publishToChannel: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/services/prisma.service';
import * as redisService from '../src/services/redis.service';
import barbersRouter from '../src/routes/barbers.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockFindUnique = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).findUnique as jest.Mock;
const mockFindMany = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).findMany as jest.Mock;
const mockUpsert = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).upsert as jest.Mock;
const mockUpdate = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).update as jest.Mock;
const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;
const mockPublish = redisService.publishToChannel as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/barbers', barbersRouter);
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
  mockExecuteRaw.mockResolvedValue(BigInt(1));
  mockPublish.mockResolvedValue(undefined);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function barberToken(userId = 'barber-uuid'): string {
  return signAccessToken({ sub: userId, role: 'barber' });
}

function consumerToken(userId = 'consumer-uuid'): string {
  return signAccessToken({ sub: userId, role: 'consumer' });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BARBER_PROFILE = {
  id: 'bp-uuid',
  userId: 'barber-uuid',
  level: 3,
  title: 'Senior',
  totalVerifiedCuts: 42,
  averageRating: '4.80',
  totalRatings: 10,
  bio: 'Fade specialist',
  instagramHandle: '@testbarber',
  tiktokHandle: '@testbarber',
  instagramAccessToken: 'secret-ig-token',
  tiktokAccessToken: 'secret-tt-token',
  isOnCall: false,
  onCallActivatedAt: null,
  serviceRadiusKm: 15,
  abn: null,
  aqfCertLevel: null,
  certVerifiedAt: null,
  certDocumentUrl: null,
  isSustainable: false,
  sustainableVerifiedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  user: {
    fullName: 'Test Barber',
    avatarUrl: null,
  },
};

const NEARBY_ROW = {
  id: 'bp-uuid',
  user_id: 'barber-uuid',
  level: 3,
  title: 'Senior',
  bio: 'Fade specialist',
  instagram_handle: '@testbarber',
  tiktok_handle: '@testbarber',
  is_on_call: true,
  service_radius_km: 15,
  abn: null,
  aqf_cert_level: null,
  is_sustainable: false,
  total_verified_cuts: 42,
  average_rating: '4.80',
  total_ratings: 10,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  full_name: 'Test Barber',
  avatar_url: null,
  distance_km: 2.34,
};

// ── GET /barbers/me ───────────────────────────────────────────────────────────

describe('GET /api/v1/barbers/me', () => {
  beforeEach(() => {
    mockUpsert.mockResolvedValue(BARBER_PROFILE);
  });

  it('returns 200 with the barber profile including user relation', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('bp-uuid');
    expect(res.body.data.level).toBe(3);
    expect(res.body.data.user.fullName).toBe('Test Barber');
  });

  it('never exposes instagramAccessToken or tiktokAccessToken', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.body.data.instagramAccessToken).toBeUndefined();
    expect(res.body.data.tiktokAccessToken).toBeUndefined();
  });

  it('upserts with userId so profile is created on first access', async () => {
    await request(buildApp())
      .get('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'barber-uuid' },
        create: expect.objectContaining({ userId: 'barber-uuid', level: 1 }),
      })
    );
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/barbers/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ── PATCH /barbers/me ─────────────────────────────────────────────────────────

describe('PATCH /api/v1/barbers/me', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({ ...BARBER_PROFILE, bio: 'Updated bio' });
  });

  it('returns 200 with updated bio', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ bio: 'Updated bio' });

    expect(res.status).toBe(200);
    expect(res.body.data.bio).toBe('Updated bio');
  });

  it('returns 200 with updated instagramHandle', async () => {
    mockUpdate.mockResolvedValue({ ...BARBER_PROFILE, instagramHandle: '@newhandle' });

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ instagramHandle: '@newhandle' });

    expect(res.status).toBe(200);
    expect(res.body.data.instagramHandle).toBe('@newhandle');
  });

  it('returns 200 with valid 11-digit ABN', async () => {
    mockUpdate.mockResolvedValue({ ...BARBER_PROFILE, abn: '12345678901' });

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ abn: '12345678901' });

    expect(res.status).toBe(200);
  });

  it('returns 200 with valid aqfCertLevel', async () => {
    mockUpdate.mockResolvedValue({ ...BARBER_PROFILE, aqfCertLevel: 'cert_iii' });

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ aqfCertLevel: 'cert_iii' });

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid ABN (not 11 digits)', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ abn: '1234' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid aqfCertLevel', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ aqfCertLevel: 'masters' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for serviceRadiusKm > 50', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ serviceRadiusKm: 51 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for bio exceeding 500 characters', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ bio: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when profile does not exist (P2025)', async () => {
    const notFoundErr = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });
    mockUpdate.mockRejectedValue(notFoundErr);

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ bio: 'hello' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('never exposes tokens in response', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ bio: 'Updated bio' });

    expect(res.body.data.instagramAccessToken).toBeUndefined();
    expect(res.body.data.tiktokAccessToken).toBeUndefined();
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .send({ bio: 'hello' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ bio: 'hello' });

    expect(res.status).toBe(403);
  });
});

// ── GET /barbers/nearby ───────────────────────────────────────────────────────

describe('GET /api/v1/barbers/nearby', () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([NEARBY_ROW]);
  });

  it('returns 200 with array of barbers including distance_km', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].distance_km).toBe(2.34);
    expect(res.body.data[0].level).toBe(3);
  });

  it('calls $queryRaw once with the geo parameters', async () => {
    await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093', radiusKm: '5' });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('works without optional params (defaults radiusKm to 10)', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no barbers found', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 400 when lat is missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lng: '151.2093' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when lng is missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when radiusKm exceeds 50', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093', radiusKm: '51' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when minLevel is out of range', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093', minLevel: '7' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is accessible without authentication (consumers can browse)', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    // No Authorization header — should still succeed
    expect(res.status).toBe(200);
  });
});

// ── GET /barbers/partnership-eligible ────────────────────────────────────────

describe('GET /api/v1/barbers/partnership-eligible', () => {
  const eligibleBarbers = [
    {
      id: 'bp-other-1',
      level: 5,
      title: 'Certified',
      user: { fullName: 'Jane Barber', avatarUrl: null },
    },
    {
      id: 'bp-other-2',
      level: 6,
      title: 'Master',
      user: { fullName: 'John Barber', avatarUrl: null },
    },
  ];

  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ id: 'bp-uuid' });
    mockFindMany.mockResolvedValue(eligibleBarbers);
  });

  it('returns 200 with Level 5+ barbers excluding self', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/partnership-eligible')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      id: 'bp-other-1',
      fullName: 'Jane Barber',
      level: 5,
      title: 'Certified',
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'bp-uuid' },
          level: { gte: 5 },
        }),
      })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(buildApp()).get('/api/v1/barbers/partnership-eligible');

    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns 403 when not barber role', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/partnership-eligible')
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('filters by q param when provided', async () => {
    await request(buildApp())
      .get('/api/v1/barbers/partnership-eligible')
      .query({ q: 'Jane' })
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: expect.objectContaining({
            fullName: { contains: 'Jane', mode: 'insensitive' },
          }),
        }),
      })
    );
  });

  it('returns 404 when barber profile not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/v1/barbers/partnership-eligible')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

// ── GET /barbers/:id ──────────────────────────────────────────────────────────

describe('GET /api/v1/barbers/:id', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue(BARBER_PROFILE);
  });

  it('returns 200 with full profile and user fields', async () => {
    const res = await request(buildApp()).get('/api/v1/barbers/bp-uuid');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('bp-uuid');
    expect(res.body.data.level).toBe(3);
    expect(res.body.data.totalVerifiedCuts).toBe(42);
    expect(res.body.data.averageRating).toBe('4.80');
    expect(res.body.data.user.fullName).toBe('Test Barber');
  });

  it('never exposes instagramAccessToken or tiktokAccessToken', async () => {
    const res = await request(buildApp()).get('/api/v1/barbers/bp-uuid');

    expect(res.body.data.instagramAccessToken).toBeUndefined();
    expect(res.body.data.tiktokAccessToken).toBeUndefined();
  });

  it('is accessible without authentication', async () => {
    const res = await request(buildApp()).get('/api/v1/barbers/bp-uuid');
    expect(res.status).toBe(200);
  });

  it('returns 404 when barber not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/v1/barbers/unknown-uuid');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('queries by profile id (not userId)', async () => {
    await request(buildApp()).get('/api/v1/barbers/bp-uuid');

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bp-uuid' } })
    );
  });
});

// ── POST /barbers/me/on-call ──────────────────────────────────────────────────

describe('POST /api/v1/barbers/me/on-call', () => {
  const LEVEL4_PROFILE = { ...BARBER_PROFILE, level: 4, isOnCall: false };
  const ACTIVATED_PROFILE = { ...BARBER_PROFILE, level: 4, isOnCall: true };

  beforeEach(() => {
    // First findUnique = level check, second = post-update response
    mockFindUnique
      .mockResolvedValueOnce(LEVEL4_PROFILE)
      .mockResolvedValueOnce(ACTIVATED_PROFILE);
  });

  it('returns 200 and activates on-call for a Level 4+ barber', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isOnCall).toBe(true);
  });

  it('calls $executeRaw to update location and on-call status', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('publishes to barber_on_call channel with barberId and coords', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(mockPublish).toHaveBeenCalledWith(
      'barber_on_call',
      JSON.stringify({ barberId: 'barber-uuid', lat: -33.8688, lng: 151.2093 })
    );
  });

  it('returns 403 when barber is Level 1–3', async () => {
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValueOnce({ ...BARBER_PROFILE, level: 3 });

    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('returns 403 when barber is Level 2', async () => {
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValueOnce({ ...BARBER_PROFILE, level: 2 });

    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(403);
  });

  it('returns 404 when barber profile does not exist', async () => {
    mockFindUnique.mockReset();
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when lat is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lng: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when lat is out of range', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: 91, lng: 151.2093 });

    expect(res.status).toBe(400);
  });

  it('never exposes tokens in response', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.body.data.instagramAccessToken).toBeUndefined();
    expect(res.body.data.tiktokAccessToken).toBeUndefined();
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(403);
  });
});

// ── DELETE /barbers/me/on-call ────────────────────────────────────────────────

describe('DELETE /api/v1/barbers/me/on-call', () => {
  it('returns 200 and deactivates on-call', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('On-call deactivated');
  });

  it('calls $executeRaw to clear location and status', async () => {
    await request(buildApp())
      .delete('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('publishes to barber_off_call channel with barberId', async () => {
    await request(buildApp())
      .delete('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockPublish).toHaveBeenCalledWith(
      'barber_off_call',
      JSON.stringify({ barberId: 'barber-uuid' })
    );
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp()).delete('/api/v1/barbers/me/on-call');
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/barbers/me/on-call')
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
  });
});

// ── GET /barbers/on-call ──────────────────────────────────────────────────────

describe('GET /api/v1/barbers/on-call', () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([{ ...NEARBY_ROW, is_on_call: true }]);
  });

  it('returns 200 with array of active on-call barbers', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].is_on_call).toBe(true);
    expect(res.body.data[0].distance_km).toBe(2.34);
  });

  it('runs $executeRaw first to auto-deactivate expired sessions (>8h)', async () => {
    await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lat: '-33.8688', lng: '151.2093' });

    // executeRaw (expire) must be called before queryRaw (fetch)
    const executeOrder = mockExecuteRaw.mock.invocationCallOrder[0];
    const queryOrder = mockQueryRaw.mock.invocationCallOrder[0];
    expect(executeOrder).toBeLessThan(queryOrder);
  });

  it('returns empty array when no on-call barbers in range', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const res = await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('is accessible without authentication', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
  });

  it('returns 400 when lat is missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lng: '151.2093' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when radiusKm exceeds 50', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lat: '-33.8688', lng: '151.2093', radiusKm: '51' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('works without optional params', async () => {
    const res = await request(buildApp())
      .get('/api/v1/barbers/on-call')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});
