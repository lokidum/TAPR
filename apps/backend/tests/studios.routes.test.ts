jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/redis.service', () => ({
  getBanned: jest.fn().mockResolvedValue(false),
  setBanned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/stripe.service', () => ({
  createConnectAccount: jest.fn().mockResolvedValue({ id: 'acct_new123' }),
  createConnectOnboardingUrl: jest.fn().mockResolvedValue('https://connect.stripe.com/onboarding/abc'),
}));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    studioProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    chairListing: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    chairRental: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    event: {
      count: jest.fn(),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ isBanned: false }) },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/services/prisma.service';
import studiosRouter from '../src/routes/studios.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockFindUnique = (prisma.studioProfile as jest.Mocked<typeof prisma.studioProfile>).findUnique as jest.Mock;
const mockUpsert = (prisma.studioProfile as jest.Mocked<typeof prisma.studioProfile>).upsert as jest.Mock;
const mockUpdate = (prisma.studioProfile as jest.Mocked<typeof prisma.studioProfile>).update as jest.Mock;
const mockChairFindMany = (prisma.chairListing as jest.Mocked<typeof prisma.chairListing>).findMany as jest.Mock;
const mockChairCount = (prisma.chairListing as jest.Mocked<typeof prisma.chairListing>).count as jest.Mock;
const mockChairRentalFindMany = (prisma.chairRental as jest.Mocked<typeof prisma.chairRental>).findMany as jest.Mock;
const mockChairRentalCount = (prisma.chairRental as jest.Mocked<typeof prisma.chairRental>).count as jest.Mock;
const mockChairRentalAggregate = (prisma.chairRental as jest.Mocked<typeof prisma.chairRental>).aggregate as jest.Mock;
const mockEventCount = (prisma.event as jest.Mocked<typeof prisma.event>).count as jest.Mock;
const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockExecuteRaw = prisma.$executeRaw as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/studios', studiosRouter);
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
  mockChairCount.mockResolvedValue(0);
  mockEventCount.mockResolvedValue(0);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function studioToken(userId = 'studio-uuid'): string {
  return signAccessToken({ sub: userId, role: 'studio' });
}

function barberToken(userId = 'barber-uuid'): string {
  return signAccessToken({ sub: userId, role: 'barber' });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STUDIO_PROFILE = {
  id: 'sp-uuid',
  userId: 'studio-uuid',
  businessName: 'Sharp Cuts Studio',
  abn: '12345678901',
  addressLine1: '42 Barber St',
  addressLine2: null,
  suburb: 'Surry Hills',
  state: 'NSW',
  postcode: '2010',
  googlePlaceId: null,
  phone: '+61299999999',
  websiteUrl: 'https://sharpcutsstudio.com',
  chairCount: 4,
  stripeAccountId: 'acct_secret123',
  isVerified: false,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const STUDIO_PROFILE_WITH_USER = {
  ...STUDIO_PROFILE,
  user: { isActive: true, isBanned: false },
};

const NEARBY_ROW = {
  id: 'sp-uuid',
  user_id: 'studio-uuid',
  business_name: 'Sharp Cuts Studio',
  abn: '12345678901',
  address_line1: '42 Barber St',
  suburb: 'Surry Hills',
  state: 'NSW',
  postcode: '2010',
  google_place_id: null,
  phone: '+61299999999',
  website_url: 'https://sharpcutsstudio.com',
  chair_count: 4,
  is_verified: false,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  full_name: 'Studio Owner',
  avatar_url: null,
  active_chair_listings: 3,
  distance_km: 1.2,
};

// ── GET /studios/me ───────────────────────────────────────────────────────────

const STUDIO_ME_ROW = {
  id: 'sp-uuid',
  user_id: 'studio-uuid',
  business_name: 'Sharp Cuts Studio',
  abn: '12345678901',
  address_line1: '42 Barber St',
  address_line2: null,
  suburb: 'Surry Hills',
  state: 'NSW',
  postcode: '2010',
  google_place_id: null,
  phone: '+61299999999',
  website_url: 'https://sharpcutsstudio.com',
  chair_count: 4,
  is_verified: false,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  lat: -33.87,
  lng: 151.2,
};

describe('GET /api/v1/studios/me', () => {
  beforeEach(() => {
    mockUpsert.mockResolvedValue(STUDIO_PROFILE);
    mockQueryRaw.mockResolvedValue([STUDIO_ME_ROW]);
  });

  it('returns 200 with the studio profile including lat/lng', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('sp-uuid');
    expect(res.body.data.businessName).toBe('Sharp Cuts Studio');
    expect(res.body.data.lat).toBe(-33.87);
    expect(res.body.data.lng).toBe(151.2);
  });

  it('never exposes stripeAccountId', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.body.data.stripeAccountId).toBeUndefined();
  });

  it('upserts with userId so profile is created on first access', async () => {
    await request(buildApp())
      .get('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'studio-uuid' },
        create: expect.objectContaining({ userId: 'studio-uuid', businessName: 'New Studio' }),
      })
    );
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/me');
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not studio', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

// ── PATCH /studios/me ─────────────────────────────────────────────────────────

describe('PATCH /api/v1/studios/me', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue(STUDIO_PROFILE);
    mockQueryRaw.mockResolvedValue([STUDIO_ME_ROW]);
  });

  it('returns 200 with updated businessName', async () => {
    mockUpdate.mockResolvedValue({ ...STUDIO_PROFILE, businessName: 'New Name' });
    mockQueryRaw.mockResolvedValue([
      { ...STUDIO_ME_ROW, business_name: 'New Name' },
    ]);

    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ businessName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.businessName).toBe('New Name');
  });

  it('returns 200 with updated chairCount', async () => {
    mockQueryRaw.mockResolvedValue([
      { ...STUDIO_ME_ROW, chair_count: 6 },
    ]);

    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ chairCount: 6 });

    expect(res.status).toBe(200);
    expect(res.body.data.chairCount).toBe(6);
  });

  it('calls $executeRaw to update coordinates when lat/lng provided', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(200);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('does NOT call $executeRaw when no lat/lng provided', async () => {
    await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ businessName: 'Name Only' });

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it('can update both regular fields and coordinates in one request', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ businessName: 'Updated', lat: -33.8688, lng: 151.2093 });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('never exposes stripeAccountId in response', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ businessName: 'Test' });

    expect(res.body.data.stripeAccountId).toBeUndefined();
  });

  it('returns 400 for invalid ABN', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ abn: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid websiteUrl', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ websiteUrl: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when only lat is provided without lng', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ lat: -33.8688 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when only lng is provided without lat', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ lng: 151.2093 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for chairCount less than 1', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ chairCount: 0 });

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
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ businessName: 'Test' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .send({ businessName: 'Test' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not studio', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/studios/me')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ businessName: 'Test' });

    expect(res.status).toBe(403);
  });
});

// ── GET /studios/me/stripe-onboarding-url ──────────────────────────────────────

describe('GET /api/v1/studios/me/stripe-onboarding-url', () => {
  const stripeService = require('../src/services/stripe.service');

  beforeEach(() => {
    mockUpsert.mockResolvedValue(STUDIO_PROFILE);
    mockFindUnique.mockResolvedValue({ ...STUDIO_PROFILE, stripeAccountId: 'acct_existing' });
  });

  it('returns 200 with url when studio has stripeAccountId', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me/stripe-onboarding-url')
      .set('Authorization', `Bearer ${studioToken()}`)
      .query({ returnUrl: 'https://tapr.com.au/stripe-return', refreshUrl: 'https://tapr.com.au/stripe-refresh' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.url).toBe('https://connect.stripe.com/onboarding/abc');
    expect(stripeService.createConnectAccount).not.toHaveBeenCalled();
  });

  it('creates Connect account and returns url when studio has no stripeAccountId', async () => {
    mockFindUnique
      .mockResolvedValueOnce({ ...STUDIO_PROFILE, stripeAccountId: null })
      .mockResolvedValueOnce({ ...STUDIO_PROFILE, stripeAccountId: 'acct_new123' });
    mockUpdate.mockResolvedValue({ ...STUDIO_PROFILE, stripeAccountId: 'acct_new123' });

    const res = await request(buildApp())
      .get('/api/v1/studios/me/stripe-onboarding-url')
      .set('Authorization', `Bearer ${studioToken()}`)
      .query({ returnUrl: 'https://tapr.com.au/stripe-return', refreshUrl: 'https://tapr.com.au/stripe-refresh' });

    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('https://connect.stripe.com/onboarding/abc');
    expect(stripeService.createConnectAccount).toHaveBeenCalledWith('AU');
  });

  it('returns 400 when returnUrl or refreshUrl missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me/stripe-onboarding-url')
      .set('Authorization', `Bearer ${studioToken()}`)
      .query({ returnUrl: 'https://tapr.com.au/stripe-return' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me/stripe-onboarding-url')
      .query({ returnUrl: 'https://tapr.com.au/stripe-return', refreshUrl: 'https://tapr.com.au/stripe-refresh' });

    expect(res.status).toBe(401);
  });
});

// ── GET /studios/me/chairs ────────────────────────────────────────────────────

describe('GET /api/v1/studios/me/chairs', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ id: 'sp-uuid' });
    mockChairFindMany.mockResolvedValue([
      {
        id: 'chair-1',
        title: 'Chair A',
        status: 'available',
        priceCentsPerDay: 5000,
        priceCentsPerWeek: 25000,
        listingType: 'daily',
        minLevelRequired: 1,
        _count: { rentals: 3 },
      },
    ]);
    mockChairCount.mockResolvedValue(1);
  });

  it('returns 200 with paginated chair listings', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me/chairs')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.listings).toHaveLength(1);
    expect(res.body.data.listings[0].title).toBe('Chair A');
    expect(res.body.data.listings[0].rentalCount).toBe(3);
    expect(res.body.data.total).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/me/chairs');
    expect(res.status).toBe(401);
  });

  it('returns 404 when studio not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/v1/studios/me/chairs')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(404);
  });
});

// ── GET /studios/me/stats ─────────────────────────────────────────────────────

describe('GET /api/v1/studios/me/stats', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ id: 'sp-uuid' });
    mockChairCount.mockResolvedValue(5);
    mockChairRentalCount.mockResolvedValue(12);
    mockChairRentalAggregate.mockResolvedValue({ _sum: { totalPriceCents: 45000 } });
  });

  it('returns 200 with stats', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me/stats')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalChairs).toBe(5);
    expect(res.body.data.rentalsThisMonth).toBe(12);
    expect(res.body.data.revenueThisMonth).toBe(45000);
    expect(res.body.data.occupancyRate).toBeDefined();
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/me/stats');
    expect(res.status).toBe(401);
  });
});

// ── GET /studios/me/rentals/recent ────────────────────────────────────────────

describe('GET /api/v1/studios/me/rentals/recent', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue({ id: 'sp-uuid' });
    mockChairRentalFindMany.mockResolvedValue([
      {
        id: 'rental-1',
        startAt: new Date('2025-03-01'),
        endAt: new Date('2025-03-05'),
        status: 'completed',
        barber: { user: { fullName: 'John Barber', avatarUrl: null } },
        listing: { title: 'Chair A' },
      },
    ]);
  });

  it('returns 200 with recent rentals', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/me/rentals/recent')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rentals).toHaveLength(1);
    expect(res.body.data.rentals[0].barberName).toBe('John Barber');
    expect(res.body.data.rentals[0].listingTitle).toBe('Chair A');
  });

  it('returns 401 without auth', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/me/rentals/recent');
    expect(res.status).toBe(401);
  });
});

// ── GET /studios/nearby ───────────────────────────────────────────────────────

describe('GET /api/v1/studios/nearby', () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([NEARBY_ROW]);
  });

  it('returns 200 with array of studios including distance_km', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].distance_km).toBe(1.2);
    expect(res.body.data[0].business_name).toBe('Sharp Cuts Studio');
  });

  it('includes active_chair_listings count in each result', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.body.data[0].active_chair_listings).toBe(3);
  });

  it('calls $queryRaw once', async () => {
    await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no studios in range', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('is accessible without authentication', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
  });

  it('returns 400 when lat is missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lng: '151.2093' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when lng is missing', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when radiusKm exceeds 50', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093', radiusKm: '51' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('defaults radiusKm to 10 when not provided', async () => {
    const res = await request(buildApp())
      .get('/api/v1/studios/nearby')
      .query({ lat: '-33.8688', lng: '151.2093' });

    expect(res.status).toBe(200);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });
});

// ── GET /studios/:id ──────────────────────────────────────────────────────────

describe('GET /api/v1/studios/:id', () => {
  beforeEach(() => {
    mockFindUnique.mockResolvedValue(STUDIO_PROFILE_WITH_USER);
    mockChairCount.mockResolvedValue(3);
    mockEventCount.mockResolvedValue(2);
  });

  it('returns 200 with studio profile, chair listings count, and events count', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/sp-uuid');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('sp-uuid');
    expect(res.body.data.businessName).toBe('Sharp Cuts Studio');
    expect(res.body.data.activeChairListings).toBe(3);
    expect(res.body.data.upcomingEvents).toBe(2);
  });

  it('never exposes stripeAccountId', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/sp-uuid');

    expect(res.body.data.stripeAccountId).toBeUndefined();
  });

  it('does not expose user.isActive or user.isBanned in response body', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/sp-uuid');

    expect(res.body.data.user).toBeUndefined();
  });

  it('fetches active chair listings and upcoming events in parallel', async () => {
    await request(buildApp()).get('/api/v1/studios/sp-uuid');

    expect(mockChairCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studioId: 'sp-uuid', status: 'available' } })
    );
    expect(mockEventCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studioId: 'sp-uuid',
          status: { in: ['planning', 'confirmed', 'live'] },
        }),
      })
    );
  });

  it('is accessible without authentication', async () => {
    const res = await request(buildApp()).get('/api/v1/studios/sp-uuid');
    expect(res.status).toBe(200);
  });

  it('returns 404 when studio not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/v1/studios/unknown-uuid');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when studio owner is banned', async () => {
    mockFindUnique.mockResolvedValue({
      ...STUDIO_PROFILE_WITH_USER,
      user: { isActive: true, isBanned: true },
    });

    const res = await request(buildApp()).get('/api/v1/studios/sp-uuid');

    expect(res.status).toBe(404);
  });

  it('returns 404 when studio owner is inactive', async () => {
    mockFindUnique.mockResolvedValue({
      ...STUDIO_PROFILE_WITH_USER,
      user: { isActive: false, isBanned: false },
    });

    const res = await request(buildApp()).get('/api/v1/studios/sp-uuid');

    expect(res.status).toBe(404);
  });
});
