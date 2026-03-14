jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    studioProfile: { findUnique: jest.fn() },
    barberProfile: { findUnique: jest.fn() },
    chairListing: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    chairRental: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    dispute: { create: jest.fn(), findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/services/stripe.service', () => ({
  createAndConfirmPlatformPayment: jest.fn(),
  createChairRentalPaymentIntent: jest.fn(),
  createListingFeePaymentIntent: jest.fn(),
  retrievePaymentIntent: jest.fn(),
  capturePaymentIntent: jest.fn(),
}));
jest.mock('../src/services/queue.service', () => ({
  enqueueEscrowReleaseJob: jest.fn().mockResolvedValue(undefined),
  cancelEscrowReleaseJob: jest.fn().mockResolvedValue(true),
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/services/prisma.service';
import * as stripeService from '../src/services/stripe.service';
import * as queueService from '../src/services/queue.service';
import chairsRouter from '../src/routes/chairs.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockStudioFindUnique = (
  prisma.studioProfile as jest.Mocked<typeof prisma.studioProfile>
).findUnique as jest.Mock;
const mockBarberFindUnique = (
  prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>
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
const mockChairRentalCreate = (
  prisma.chairRental as jest.Mocked<typeof prisma.chairRental>
).create as jest.Mock;
const mockChairRentalFindUnique = (
  prisma.chairRental as jest.Mocked<typeof prisma.chairRental>
).findUnique as jest.Mock;
const mockChairRentalUpdate = (
  prisma.chairRental as jest.Mocked<typeof prisma.chairRental>
).update as jest.Mock;
const mockDisputeCreate = (
  prisma.dispute as jest.Mocked<typeof prisma.dispute>
).create as jest.Mock;
const mockDisputeFindFirst = (
  prisma.dispute as jest.Mocked<typeof prisma.dispute>
).findFirst as jest.Mock;
const mockUserFindMany = (prisma.user as jest.Mocked<typeof prisma.user>).findMany as jest.Mock;
const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockPrismaTransaction = (prisma as jest.Mocked<typeof prisma>).$transaction as jest.Mock;
const mockCreateAndConfirmPlatformPayment =
  stripeService.createAndConfirmPlatformPayment as jest.Mock;
const mockCreateListingFeePaymentIntent =
  stripeService.createListingFeePaymentIntent as jest.Mock;
const mockRetrievePaymentIntent = stripeService.retrievePaymentIntent as jest.Mock;
const mockCreateChairRentalPaymentIntent =
  stripeService.createChairRentalPaymentIntent as jest.Mock;
const mockCapturePaymentIntent = stripeService.capturePaymentIntent as jest.Mock;
const mockEnqueueEscrowReleaseJob = queueService.enqueueEscrowReleaseJob as jest.Mock;
const mockCancelEscrowReleaseJob = queueService.cancelEscrowReleaseJob as jest.Mock;
const mockEnqueueNotification = queueService.enqueueNotification as jest.Mock;

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

const BARBER_USER_ID = 'barber-user-uuid';
const BARBER_PROFILE_ID = 'barber-profile-uuid';
const RENTAL_ID = 'rental-uuid';

function studioToken(): string {
  return signAccessToken({ sub: STUDIO_USER_ID, role: 'studio' });
}

function barberToken(): string {
  return signAccessToken({ sub: BARBER_USER_ID, role: 'barber' });
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

  it('400 — missing both paymentMethodId and paymentIntentId', async () => {
    const { paymentMethodId: _pm, ...body } = VALID_CREATE_BODY;

    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('201 — creates listing with paymentIntentId when PaymentIntent succeeded', async () => {
    mockRetrievePaymentIntent.mockResolvedValue({
      id: 'pi_fee123',
      status: 'succeeded',
      metadata: { studioId: STUDIO_ID, type: 'chair_listing_fee' },
    });
    mockChairCreate.mockResolvedValue(CREATED_LISTING);

    const { paymentMethodId: _pm, ...body } = VALID_CREATE_BODY;
    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ ...body, paymentIntentId: 'pi_fee123' });

    expect(res.status).toBe(201);
    expect(mockRetrievePaymentIntent).toHaveBeenCalledWith('pi_fee123');
    expect(mockCreateAndConfirmPlatformPayment).not.toHaveBeenCalled();
  });

  it('402 — paymentIntentId not succeeded', async () => {
    mockRetrievePaymentIntent.mockResolvedValue({
      id: 'pi_fee123',
      status: 'requires_payment_method',
      metadata: { studioId: STUDIO_ID, type: 'chair_listing_fee' },
    });

    const { paymentMethodId: _pm, ...body } = VALID_CREATE_BODY;
    const res = await request(buildApp())
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ ...body, paymentIntentId: 'pi_fee123' });

    expect(res.status).toBe(402);
    expect(mockChairCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/chairs/listing-fee-intent', () => {
  beforeEach(() => {
    mockCreateListingFeePaymentIntent.mockResolvedValue({
      id: 'pi_intent123',
      client_secret: 'pi_intent123_secret_xyz',
    });
  });

  it('200 — returns clientSecret and paymentIntentId', async () => {
    const res = await request(buildApp())
      .post('/api/v1/chairs/listing-fee-intent')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.clientSecret).toBe('pi_intent123_secret_xyz');
    expect(res.body.data.paymentIntentId).toBe('pi_intent123');
    expect(mockCreateListingFeePaymentIntent).toHaveBeenCalledWith(
      500,
      expect.objectContaining({ studioId: STUDIO_ID, type: 'chair_listing_fee' })
    );
  });

  it('401 — no auth', async () => {
    const res = await request(buildApp()).post('/api/v1/chairs/listing-fee-intent');
    expect(res.status).toBe(401);
  });

  it('404 — studio profile not found', async () => {
    mockStudioFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/chairs/listing-fee-intent')
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(404);
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
        lat: -33.87,
        lng: 151.2,
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

// ── POST /chairs/:id/rent ─────────────────────────────────────────────────────

describe('POST /api/v1/chairs/:id/rent', () => {
  const availableListing = {
    id: LISTING_ID,
    studioId: STUDIO_ID,
    status: 'available',
    minLevelRequired: 2,
    listingType: 'daily',
    priceCentsPerDay: 5000,
    priceCentsPerWeek: 25000,
    availableFrom: new Date('2025-06-01T09:00:00Z'),
    availableTo: new Date('2025-06-30T18:00:00Z'),
    studio: { stripeAccountId: 'acct_studio123' },
  };

  const createdRental = {
    id: RENTAL_ID,
    listingId: LISTING_ID,
    barberId: BARBER_PROFILE_ID,
    startAt: new Date('2025-06-10T09:00:00Z'),
    endAt: new Date('2025-06-12T18:00:00Z'),
    totalPriceCents: 10000,
    status: 'active',
    stripePaymentIntentId: 'pi_rental123',
    listing: { title: 'Prime Chair' },
  };

  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID, level: 3 });
    mockChairFindUnique.mockResolvedValue(availableListing);
    mockCreateChairRentalPaymentIntent.mockResolvedValue({
      id: 'pi_rental123',
      client_secret: 'pi_rental123_secret',
    });
    mockPrismaTransaction.mockImplementation((fns: unknown[]) => Promise.all(fns));
    mockChairRentalCreate.mockResolvedValue(createdRental);
  });

  it('201 — creates rental and returns clientSecret', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rent`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({
        startAt: '2025-06-10T00:00:00Z',
        endAt: '2025-06-12T00:00:00Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.rental.clientSecret).toBe('pi_rental123_secret');
    expect(mockCreateChairRentalPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 10000,
        studioStripeAccountId: 'acct_studio123',
      })
    );
  });

  it('403 — barber level too low', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID, level: 1 });

    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rent`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({
        startAt: '2025-06-10T09:00:00Z',
        endAt: '2025-06-12T18:00:00Z',
      });

    expect(res.status).toBe(403);
  });

  it('422 — listing not available', async () => {
    mockChairFindUnique.mockResolvedValue({ ...availableListing, status: 'reserved' });

    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rent`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({
        startAt: '2025-06-10T09:00:00Z',
        endAt: '2025-06-12T18:00:00Z',
      });

    expect(res.status).toBe(422);
  });

  it('422 — rental period outside availability', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rent`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({
        startAt: '2025-05-01T09:00:00Z',
        endAt: '2025-05-02T18:00:00Z',
      });

    expect(res.status).toBe(422);
  });

  it('403 — studio cannot rent', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rent`)
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({
        startAt: '2025-06-10T09:00:00Z',
        endAt: '2025-06-12T18:00:00Z',
      });

    expect(res.status).toBe(403);
  });
});

// ── PATCH /chairs/:id/rentals/:rentalId/complete ──────────────────────────────

describe('PATCH /api/v1/chairs/:id/rentals/:rentalId/complete', () => {
  const listingWithStudio = {
    id: LISTING_ID,
    studioId: STUDIO_ID,
    studio: { stripeAccountId: 'acct_studio123' },
  };

  const activeRental = {
    id: RENTAL_ID,
    listingId: LISTING_ID,
    status: 'active',
    stripePaymentIntentId: 'pi_rental123',
  };

  beforeEach(() => {
    mockChairFindUnique.mockResolvedValue(listingWithStudio);
    mockChairRentalFindUnique.mockResolvedValue(activeRental);
    mockCapturePaymentIntent.mockResolvedValue({});
    mockPrismaTransaction.mockImplementation((fns: unknown[]) => Promise.all(fns));
    mockChairRentalUpdate.mockResolvedValue({ ...activeRental, status: 'completed' });
    mockEnqueueEscrowReleaseJob.mockResolvedValue(undefined);
  });

  it('200 — studio completes rental and enqueues escrow job', async () => {
    const res = await request(buildApp())
      .patch(`/api/v1/chairs/${LISTING_ID}/rentals/${RENTAL_ID}/complete`)
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(200);
    expect(mockCapturePaymentIntent).toHaveBeenCalledWith('pi_rental123');
    expect(mockEnqueueEscrowReleaseJob).toHaveBeenCalledWith(
      {
        rentalId: RENTAL_ID,
        paymentIntentId: 'pi_rental123',
        studioStripeAccountId: 'acct_studio123',
      },
      48 * 60 * 60 * 1000
    );
  });

  it('404 — non-owner studio cannot complete', async () => {
    mockChairFindUnique.mockResolvedValue({
      ...listingWithStudio,
      studioId: 'other-studio-id',
    });

    const res = await request(buildApp())
      .patch(`/api/v1/chairs/${LISTING_ID}/rentals/${RENTAL_ID}/complete`)
      .set('Authorization', `Bearer ${studioToken()}`);

    expect(res.status).toBe(404);
  });

  it('403 — barber cannot complete', async () => {
    const res = await request(buildApp())
      .patch(`/api/v1/chairs/${LISTING_ID}/rentals/${RENTAL_ID}/complete`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(403);
  });
});

// ── POST /chairs/:id/rentals/:rentalId/dispute ────────────────────────────────

describe('POST /api/v1/chairs/:id/rentals/:rentalId/dispute', () => {
  const rentalWithParties = {
    id: RENTAL_ID,
    listingId: LISTING_ID,
    barber: { user: { id: BARBER_USER_ID } },
    listing: { studio: { user: { id: STUDIO_USER_ID } } },
  };

  beforeEach(() => {
    mockChairRentalFindUnique.mockResolvedValue(rentalWithParties);
    mockPrismaTransaction.mockImplementation((fns: unknown[]) => Promise.all(fns));
    mockDisputeCreate.mockResolvedValue({ id: 'dispute-uuid' });
    mockChairRentalUpdate.mockResolvedValue({});
    mockCancelEscrowReleaseJob.mockResolvedValue(true);
    mockDisputeFindFirst.mockResolvedValue({ id: 'dispute-uuid' });
    mockUserFindMany.mockResolvedValue([{ id: 'admin-uuid' }]);
  });

  it('201 — barber raises dispute, cancels escrow job, notifies parties', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rentals/${RENTAL_ID}/dispute`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ reason: 'Chair was damaged', evidenceUrls: ['https://example.com/photo.jpg'] });

    expect(res.status).toBe(201);
    expect(mockCancelEscrowReleaseJob).toHaveBeenCalledWith(RENTAL_ID);
    expect(mockEnqueueNotification).toHaveBeenCalledTimes(3);
  });

  it('201 — studio raises dispute', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rentals/${RENTAL_ID}/dispute`)
      .set('Authorization', `Bearer ${studioToken()}`)
      .send({ reason: 'No-show' });

    expect(res.status).toBe(201);
  });

  it('403 — third party cannot raise dispute', async () => {
    const otherToken = signAccessToken({ sub: 'other-user-id', role: 'consumer' });

    const res = await request(buildApp())
      .post(`/api/v1/chairs/${LISTING_ID}/rentals/${RENTAL_ID}/dispute`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ reason: 'Not my business' });

    expect(res.status).toBe(403);
  });
});
