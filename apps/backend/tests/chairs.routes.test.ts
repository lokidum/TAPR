jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    studioProfile: { findUnique: jest.fn() },
    chairListing: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));
jest.mock('../src/services/stripe.service', () => ({
  createAndConfirmPlatformPayment: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/services/prisma.service';
import * as stripeService from '../src/services/stripe.service';
import chairsRouter from '../src/routes/chairs.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockStudioFindUnique = (
  prisma.studioProfile as jest.Mocked<typeof prisma.studioProfile>
).findUnique as jest.Mock;
const mockChairCreate = (
  prisma.chairListing as jest.Mocked<typeof prisma.chairListing>
).create as jest.Mock;
const mockChairFindUnique = (
  prisma.chairListing as jest.Mocked<typeof prisma.chairListing>
).findUnique as jest.Mock;
const mockChairUpdate = (
  prisma.chairListing as jest.Mocked<typeof prisma.chairListing>
).update as jest.Mock;
const mockChairDelete = (
  prisma.chairListing as jest.Mocked<typeof prisma.chairListing>
).delete as jest.Mock;
const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockCreateAndConfirmPlatformPayment =
  stripeService.createAndConfirmPlatformPayment as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/chairs', chairsRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const STUDIO_USER_ID = 'studio-user-uuid';
const STUDIO_ID = 'studio-profile-uuid';
const LISTING_ID = 'listing-uuid';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStudioFindUnique.mockResolvedValue({ id: STUDIO_ID });
});

function studioToken(): string {
  return signAccessToken({ sub: STUDIO_USER_ID, role: 'studio' });
}

const VALID_CREATE_BODY = {
  title: 'Prime Chair',
  description: 'Corner spot',
  priceCentsPerDay: 5000,
  priceCentsPerWeek: 25000,
  availableFrom: '2025-06-01T09:00:00Z',
  availableTo: '2025-06-30T18:00:00Z',
  listingType: 'daily',
  minLevelRequired: 2,
  isSickCall: false,
  sickCallPremiumPct: 0,
  paymentMethodId: 'pm_card123',
};

const CREATED_LISTING = {
  id: LISTING_ID,
  studioId: STUDIO_ID,
  title: 'Prime Chair',
  description: 'Corner spot',
  priceCentsPerDay: 5000,
  priceCentsPerWeek: 25000,
  availableFrom: new Date('2025-06-01T09:00:00Z'),
  availableTo: new Date('2025-06-30T18:00:00Z'),
  listingType: 'daily',
  minLevelRequired: 2,
  isSickCall: false,
  sickCallPremiumPct: 0,
  status: 'available',
  stripeListingFeePaymentId: 'pi_fee123',
  studio: { businessName: 'Sharp Cuts' },
};

describe('POST /api/v1/chairs', () => {
  beforeEach(() => {
    mockCreateAndConfirmPlatformPayment.mockResolvedValue({
      id: 'pi_fee123',
      status: 'succeeded',
    });
    mockChairCreate.mockResolvedValue(CREATED_LISTING);
  });

  it('201 — creates listing after successful payment', async () => {
    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.listing.id).toBe(LISTING_ID);
    expect(mockCreateAndConfirmPlatformPayment).toHaveBeenCalledWith(
      500,
      'pm_card123',
      expect.objectContaining({ studioId: STUDIO_ID, type: 'chair_listing_fee' })
    );
  });

  it('402 — payment fails', async () => {
    mockCreateAndConfirmPlatformPayment.mockResolvedValue({
      id: 'pi_fee123',
      status: 'requires_action',
    });

    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(402);
    expect(mockChairCreate).not.toHaveBeenCalled();
  });

  it('402 — payment throws', async () => {
    mockCreateAndConfirmPlatformPayment.mockRejectedValue(new Error('Card declined'));

    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(402);
  });

  it('401 — no auth', async () => {
    const res = await request(buildApp()).post('/api/v1/chairs').send(VALID_CREATE_BODY);
    expect(res.status).toBe(401);
  });

  it('403 — barber cannot create', async () => {
    const barberToken = signAccessToken({ sub: 'barber-id', role: 'barber' });
    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${barberToken}`)
      .send(VALID_CREATE_BODY);
    expect(res.status).toBe(403);
  });

  it('404 — studio profile not found', async () => {
    mockStudioFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(404);
  });

  it('400 — priceCentsPerDay below 1000', async () => {
    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ ...VALID_CREATE_BODY, priceCentsPerDay: 500 });

    expect(res.status).toBe(400);
  });

  it('400 — missing paymentMethodId', async () => {
    const { paymentMethodId: _pm, ...body } = VALID_CREATE_BODY;

    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(body);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/chairs/nearby', () => {
  beforeEach(() => {
    mockQueryRaw.mockResolvedValue([
      {
        id: LISTING_ID,
        studio_id: STUDIO_ID,
        title: 'Prime Chair',
        description: 'Corner',
        price_cents_per_day: 5000,
        price_cents_per_week: 25000,
        available_from: new Date('2025-06-01'),
        available_to: new Date('2025-06-30'),
        listing_type: 'daily',
        min_level_required: 1,
        is_sick_call: false,
        sick_call_premium_pct: 0,
        status: 'available',
        studio_name: 'Sharp Cuts',
        distance_km: 2.5,
      },
    ]);
  });

  it('200 — returns nearby listings with studio name and distance', async () => {
    const res = await request(buildApp())
      .get('/api/v1/chairs/nearby?lat=-33.87&lng=151.2');

    expect(res.status).toBe(200);
    expect(res.body.data.listings).toHaveLength(1);
    expect(res.body.data.listings[0].studioName).toBe('Sharp Cuts');
    expect(res.body.data.listings[0].distanceKm).toBe(2.5);
  });

  it('works without auth', async () => {
    const res = await request(buildApp())
      .get('/api/v1/chairs/nearby?lat=-33.87&lng=151.2');

    expect(res.status).toBe(200);
  });

  it('400 — missing lat', async () => {
    const res = await request(buildApp()).get('/api/v1/chairs/nearby?lng=151.2');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/chairs/:id', () => {
  const listingWithStudio = {
    ...CREATED_LISTING,
    studio: {
      id: STUDIO_ID,
      businessName: 'Sharp Cuts',
      suburb: 'Surry Hills',
      state: 'NSW',
      addressLine1: '42 Barber St',
      chairCount: 4,
      isVerified: true,
    },
  };

  beforeEach(() => {
    mockChairFindUnique.mockResolvedValue(listingWithStudio);
  });

  it('200 — returns full listing with studio info', async () => {
    const res = await request(buildApp()).get(`/api/v1/chairs/${LISTING_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.listing.id).toBe(LISTING_ID);
    expect(res.body.data.listing.studio.businessName).toBe('Sharp Cuts');
  });

  it('404 — listing not found', async () => {
    mockChairFindUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get(`/api/v1/chairs/${LISTING_ID}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/chairs/:id', () => {
  const existingListing = {
    ...CREATED_LISTING,
    studioId: STUDIO_ID,
  };

  beforeEach(() => {
    mockChairFindUnique.mockResolvedValue(existingListing);
    mockChairUpdate.mockResolvedValue({ ...existingListing, title: 'Updated Chair' });
  });

  it('200 — studio owner updates listing', async () => {
    const res = await request(buildApp())
      .patch(`/api/v1/chairs/${LISTING_ID}`)
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ title: 'Updated Chair' });

    expect(res.status).toBe(200);
    expect(res.body.data.listing.title).toBe('Updated Chair');
  });

  it('403 — non-owner cannot update', async () => {
    mockChairFindUnique.mockResolvedValue({ ...existingListing, studioId: 'other-studio-id' });

    const res = await request(buildApp())
      .patch(`/api/v1/chairs/${LISTING_ID}`)
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth', async () => {
    const res = await request(buildApp())
      .patch(`/api/v1/chairs/${LISTING_ID}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/chairs/:id', () => {
  const availableListing = { ...CREATED_LISTING, status: 'available' as const };
  const reservedListing = { ...CREATED_LISTING, status: 'reserved' as const };

  const setupOwner = () => {
    mockChairFindUnique.mockResolvedValue(availableListing);
  };

  it('204 — studio owner deletes available listing', async () => {
    setupOwner();

    const res = await request(buildApp())
      .delete(`/api/v1/chairs/${LISTING_ID}`)
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(204);
    expect(mockChairDelete).toHaveBeenCalledWith({ where: { id: LISTING_ID } });
  });

  it('422 — cannot delete reserved listing', async () => {
    mockChairFindUnique.mockResolvedValue(reservedListing);

    const res = await request(buildApp())
      .delete(`/api/v1/chairs/${LISTING_ID}`)
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(422);
    expect(mockChairDelete).not.toHaveBeenCalled();
  });

  it('403 — non-owner cannot delete', async () => {
    mockChairFindUnique.mockResolvedValue({ ...availableListing, studioId: 'other-studio' });

    const res = await request(buildApp())
      .delete(`/api/v1/chairs/${LISTING_ID}`)
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(403);
  });
});
