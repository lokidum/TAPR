jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    barberProfile: { findUnique: jest.fn() },
    booking: { create: jest.fn() },
  },
}));
jest.mock('../src/services/redis.service', () => ({
  getIdempotencyResponse: jest.fn(),
  setIdempotencyResponse: jest.fn(),
}));
jest.mock('../src/services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/services/prisma.service';
import * as redisService from '../src/services/redis.service';
import * as stripeService from '../src/services/stripe.service';
import bookingsRouter from '../src/routes/bookings.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockBarberFindUnique = (
  prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>
).findUnique as jest.Mock;
const mockBookingCreate = (
  prisma.booking as jest.Mocked<typeof prisma.booking>
).create as jest.Mock;
const mockGetIdempotency = redisService.getIdempotencyResponse as jest.Mock;
const mockSetIdempotency = redisService.setIdempotencyResponse as jest.Mock;
const mockCreatePaymentIntent = stripeService.createPaymentIntent as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/bookings', bookingsRouter);
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
  mockGetIdempotency.mockResolvedValue(null);
  mockSetIdempotency.mockResolvedValue(undefined);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONSUMER_ID = 'a0000001-0000-0000-0000-000000000001';
const BARBER_PROFILE_ID = 'a0000002-0000-0000-0000-000000000002';
const BOOKING_ID = 'a0000003-0000-0000-0000-000000000003';
const STRIPE_PI_ID = 'pi_test_123456';
const STRIPE_CLIENT_SECRET = 'pi_test_123456_secret_xyz';

const BARBER_PROFILE = {
  id: BARBER_PROFILE_ID,
  userId: 'a0000005-0000-0000-0000-000000000005',
  stripeAccountId: 'acct_barber123',
  user: { isActive: true, isBanned: false },
};

const PAYMENT_INTENT = {
  id: STRIPE_PI_ID,
  client_secret: STRIPE_CLIENT_SECRET,
  status: 'requires_capture',
};

const BOOKING = {
  id: BOOKING_ID,
  consumerId: CONSUMER_ID,
  barberId: BARBER_PROFILE_ID,
  studioId: null,
  serviceType: 'mobile',
  scheduledAt: new Date('2099-06-01T10:00:00Z'),
  durationMinutes: 60,
  priceCents: 5000,
  platformFeeCents: 500,
  barberPayoutCents: 4500,
  studioPayoutCents: null,
  stripePaymentIntentId: STRIPE_PI_ID,
  status: 'pending',
};

const VALID_BODY = {
  barberId: BARBER_PROFILE_ID,
  serviceType: 'mobile',
  scheduledAt: '2099-06-01T10:00:00Z',
  durationMinutes: 60,
  priceCents: 5000,
};

function consumerToken(): string {
  return signAccessToken({ sub: CONSUMER_ID, role: 'consumer' });
}

// ── POST /bookings ─────────────────────────────────────────────────────────────

describe('POST /api/v1/bookings', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue(BARBER_PROFILE);
    mockCreatePaymentIntent.mockResolvedValue(PAYMENT_INTENT);
    mockBookingCreate.mockResolvedValue(BOOKING);
  });

  it('201 — creates booking and returns booking + clientSecret', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.booking.id).toBe(BOOKING_ID);
    expect(res.body.data.clientSecret).toBe(STRIPE_CLIENT_SECRET);
  });

  it('calls createPaymentIntent with correct fee breakdown', async () => {
    await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 5000,
        barberStripeAccountId: 'acct_barber123',
        platformFeeCents: 500, // 10% of 5000
      })
    );
  });

  it('calculates barberPayoutCents correctly (price - platform - studio)', async () => {
    await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(mockBookingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barberPayoutCents: 4500, // 5000 - 500 - 0
          studioPayoutCents: null,
        }),
      })
    );
  });

  it('deducts 5% studio share when studioId is provided', async () => {
    const STUDIO_ID = 'a0000004-0000-0000-0000-000000000004';
    await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ ...VALID_BODY, studioId: STUDIO_ID });

    expect(mockBookingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studioPayoutCents: 250, // 5% of 5000
          barberPayoutCents: 4250, // 5000 - 500 - 250
        }),
      })
    );
  });

  it('persists booking with correct fields', async () => {
    await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(mockBookingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consumerId: CONSUMER_ID,
          barberId: BARBER_PROFILE_ID,
          serviceType: 'mobile',
          durationMinutes: 60,
          priceCents: 5000,
          platformFeeCents: 500,
          stripePaymentIntentId: STRIPE_PI_ID,
          status: 'pending',
        }),
      })
    );
  });

  it('401 — no auth token', async () => {
    const res = await request(buildApp()).post('/api/v1/bookings').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('403 — barber role cannot create booking', async () => {
    const barberToken = signAccessToken({ sub: 'barber-user-id', role: 'barber' });
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${barberToken}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('404 — barber not found', async () => {
    mockBarberFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  it('404 — barber is banned', async () => {
    mockBarberFindUnique.mockResolvedValue({
      ...BARBER_PROFILE,
      user: { isActive: true, isBanned: true },
    });

    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  it('404 — barber account is inactive', async () => {
    mockBarberFindUnique.mockResolvedValue({
      ...BARBER_PROFILE,
      user: { isActive: false, isBanned: false },
    });

    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  it('422 — barber has no Stripe account', async () => {
    mockBarberFindUnique.mockResolvedValue({
      ...BARBER_PROFILE,
      stripeAccountId: null,
    });

    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(422);
  });

  it('400 — missing required field (barberId)', async () => {
    const { barberId: _b, ...body } = VALID_BODY;

    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(body);

    expect(res.status).toBe(400);
  });

  it('400 — invalid serviceType', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ ...VALID_BODY, serviceType: 'underwater' });

    expect(res.status).toBe(400);
  });

  it('400 — durationMinutes not in allowed set', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ ...VALID_BODY, durationMinutes: 75 });

    expect(res.status).toBe(400);
  });

  it('400 — scheduledAt is in the past', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ ...VALID_BODY, scheduledAt: '2020-01-01T00:00:00Z' });

    expect(res.status).toBe(400);
  });

  it('400 — priceCents below minimum (100)', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ ...VALID_BODY, priceCents: 50 });

    expect(res.status).toBe(400);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('POST /api/v1/bookings — idempotency', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue(BARBER_PROFILE);
    mockCreatePaymentIntent.mockResolvedValue(PAYMENT_INTENT);
    mockBookingCreate.mockResolvedValue(BOOKING);
  });

  it('returns cached response on replay without hitting Stripe or Prisma', async () => {
    const cachedBody = { success: true, data: { booking: BOOKING, clientSecret: STRIPE_CLIENT_SECRET } };
    mockGetIdempotency.mockResolvedValue(JSON.stringify(cachedBody));

    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .set('Idempotency-Key', 'idem-key-abc123')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockCreatePaymentIntent).not.toHaveBeenCalled();
    expect(mockBookingCreate).not.toHaveBeenCalled();
  });

  it('stores response in Redis when Idempotency-Key header is present', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .set('Idempotency-Key', 'idem-key-def456')
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockSetIdempotency).toHaveBeenCalledWith(
      'idem-key-def456',
      expect.any(String),
      86400
    );
  });

  it('does NOT store in Redis when no Idempotency-Key header', async () => {
    const res = await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(mockSetIdempotency).not.toHaveBeenCalled();
  });

  it('checks Redis before any business logic when key is present', async () => {
    mockGetIdempotency.mockResolvedValue(null);

    await request(buildApp())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .set('Idempotency-Key', 'idem-key-ghi789')
      .send(VALID_BODY);

    expect(mockGetIdempotency).toHaveBeenCalledWith('idem-key-ghi789');
    // Idempotency check call order should precede barber lookup
    const idempotencyCallOrder = mockGetIdempotency.mock.invocationCallOrder[0];
    const barberCallOrder = mockBarberFindUnique.mock.invocationCallOrder[0];
    expect(idempotencyCallOrder).toBeLessThan(barberCallOrder);
  });
});
