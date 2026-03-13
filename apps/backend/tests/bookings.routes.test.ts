jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    barberProfile: { findUnique: jest.fn(), update: jest.fn() },
    booking: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));
jest.mock('../src/services/redis.service', () => ({
  getIdempotencyResponse: jest.fn(),
  setIdempotencyResponse: jest.fn(),
}));
jest.mock('../src/services/stripe.service', () => ({
  createPaymentIntent: jest.fn(),
  capturePaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn(),
  refundPaymentIntent: jest.fn(),
  createTransfer: jest.fn(),
}));
jest.mock('../src/services/queue.service', () => ({
  enqueueBookingReminder: jest.fn().mockResolvedValue(undefined),
  enqueueReviewRequest: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/services/prisma.service';
import * as redisService from '../src/services/redis.service';
import * as stripeService from '../src/services/stripe.service';
import * as queueService from '../src/services/queue.service';
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
const mockBookingFindUnique = (
  prisma.booking as jest.Mocked<typeof prisma.booking>
).findUnique as jest.Mock;
const mockBookingFindMany = (
  prisma.booking as jest.Mocked<typeof prisma.booking>
).findMany as jest.Mock;
const mockBookingCount = (
  prisma.booking as jest.Mocked<typeof prisma.booking>
).count as jest.Mock;
const mockBookingUpdate = (
  prisma.booking as jest.Mocked<typeof prisma.booking>
).update as jest.Mock;
const mockBarberProfileUpdate = (
  prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>
).update as jest.Mock;
const mockPrismaTransaction = (prisma as jest.Mocked<typeof prisma>).$transaction as jest.Mock;
const mockPrismaQueryRaw = (prisma as jest.Mocked<typeof prisma>).$queryRaw as jest.Mock;
const mockGetIdempotency = redisService.getIdempotencyResponse as jest.Mock;
const mockSetIdempotency = redisService.setIdempotencyResponse as jest.Mock;
const mockCreatePaymentIntent = stripeService.createPaymentIntent as jest.Mock;
const mockCapturePaymentIntent = stripeService.capturePaymentIntent as jest.Mock;
const mockCancelPaymentIntent = stripeService.cancelPaymentIntent as jest.Mock;
const mockRefundPaymentIntent = stripeService.refundPaymentIntent as jest.Mock;
const mockCreateTransfer = stripeService.createTransfer as jest.Mock;
const mockEnqueueBookingReminder = queueService.enqueueBookingReminder as jest.Mock;
const mockEnqueueReviewRequest = queueService.enqueueReviewRequest as jest.Mock;

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

const BARBER_USER_ID = 'a0000005-0000-0000-0000-000000000005';
const ADMIN_ID = 'a0000006-0000-0000-0000-000000000006';
const STUDIO_ID = 'a0000004-0000-0000-0000-000000000004';

function consumerToken(): string {
  return signAccessToken({ sub: CONSUMER_ID, role: 'consumer' });
}

function barberToken(): string {
  return signAccessToken({ sub: BARBER_USER_ID, role: 'barber' });
}

function adminToken(): string {
  return signAccessToken({ sub: ADMIN_ID, role: 'admin' });
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

// ── GET /bookings/:id ─────────────────────────────────────────────────────────

describe('GET /api/v1/bookings/:id', () => {
  const setupBarberProfileMock = () => {
    mockBarberFindUnique.mockImplementation((args: { where: { userId?: string; id?: string } }) => {
      if (args.where.userId === BARBER_USER_ID) return Promise.resolve({ id: BARBER_PROFILE_ID });
      if (args.where.id === BARBER_PROFILE_ID) return Promise.resolve(BARBER_PROFILE);
      return Promise.resolve(null);
    });
  };

  beforeEach(() => {
    mockBarberFindUnique.mockReset();
  });

  it('200 — consumer sees own booking', async () => {
    mockBookingFindUnique.mockResolvedValue(BOOKING);

    const res = await request(buildApp())
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.id).toBe(BOOKING_ID);
  });

  it('200 — barber sees booking assigned to them', async () => {
    setupBarberProfileMock();
    mockBookingFindUnique.mockResolvedValue(BOOKING);

    const res = await request(buildApp())
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.id).toBe(BOOKING_ID);
  });

  it('200 — admin sees any booking', async () => {
    mockBookingFindUnique.mockResolvedValue(BOOKING);

    const res = await request(buildApp())
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.id).toBe(BOOKING_ID);
  });

  it('404 — booking not found', async () => {
    mockBookingFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(404);
  });

  it('403 — consumer cannot see another consumer booking', async () => {
    const otherConsumerBooking = { ...BOOKING, consumerId: 'other-consumer-uuid' };
    mockBookingFindUnique.mockResolvedValue(otherConsumerBooking);

    const res = await request(buildApp())
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
  });

  it('403 — barber cannot see booking not assigned to them', async () => {
    setupBarberProfileMock();
    const otherBarberBooking = { ...BOOKING, barberId: 'other-barber-uuid' };
    mockBookingFindUnique.mockResolvedValue(otherBarberBooking);

    const res = await request(buildApp())
      .get(`/api/v1/bookings/${BOOKING_ID}`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(403);
  });

  it('401 — no auth', async () => {
    const res = await request(buildApp()).get(`/api/v1/bookings/${BOOKING_ID}`);
    expect(res.status).toBe(401);
  });
});

// ── PATCH /bookings/:id/confirm ───────────────────────────────────────────────

describe('PATCH /api/v1/bookings/:id/confirm', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockEnqueueBookingReminder.mockResolvedValue(undefined);
  });

  it('200 — barber confirms pending booking and enqueues reminder', async () => {
    const confirmed = { ...BOOKING, status: 'confirmed' };
    mockBookingFindUnique.mockResolvedValue(BOOKING);
    mockBookingUpdate.mockResolvedValue(confirmed);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('confirmed');
    expect(mockEnqueueBookingReminder).toHaveBeenCalledWith(
      { bookingId: BOOKING_ID, consumerId: CONSUMER_ID, barberId: BARBER_PROFILE_ID },
      expect.any(Number)
    );
  });

  it('404 — booking not found', async () => {
    mockBookingFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(404);
  });

  it('403 — barber cannot confirm booking not assigned to them', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: 'other-barber-profile-id' });
    mockBookingFindUnique.mockResolvedValue(BOOKING);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(403);
  });

  it('422 — cannot confirm non-pending booking', async () => {
    mockBookingFindUnique.mockResolvedValue({ ...BOOKING, status: 'confirmed' });

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(422);
  });

  it('403 — consumer cannot confirm', async () => {
    mockBookingFindUnique.mockResolvedValue(BOOKING);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/confirm`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
  });
});

// ── PATCH /bookings/:id/cancel ─────────────────────────────────────────────────

describe('PATCH /api/v1/bookings/:id/cancel', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
  });

  it('200 — consumer cancels >24h before: full refund via cancel PI', async () => {
    const futureBooking = {
      ...BOOKING,
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: 'pending',
    };
    const cancelled = { ...futureBooking, status: 'cancelled' };
    mockBookingFindUnique.mockResolvedValue(futureBooking);
    mockCancelPaymentIntent.mockResolvedValue({});
    mockBookingUpdate.mockResolvedValue(cancelled);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('cancelled');
    expect(mockCancelPaymentIntent).toHaveBeenCalledWith(STRIPE_PI_ID);
    expect(mockCapturePaymentIntent).not.toHaveBeenCalled();
    expect(mockRefundPaymentIntent).not.toHaveBeenCalled();
  });

  it('200 — consumer cancels <24h before: 50% refund via capture + refund', async () => {
    const soonBooking = {
      ...BOOKING,
      scheduledAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      status: 'pending',
    };
    const cancelled = { ...soonBooking, status: 'cancelled' };
    mockBookingFindUnique.mockResolvedValue(soonBooking);
    mockCapturePaymentIntent.mockResolvedValue({});
    mockRefundPaymentIntent.mockResolvedValue({});
    mockBookingUpdate.mockResolvedValue(cancelled);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('cancelled');
    expect(mockCapturePaymentIntent).toHaveBeenCalledWith(STRIPE_PI_ID);
    expect(mockRefundPaymentIntent).toHaveBeenCalledWith(STRIPE_PI_ID, 2500); // 50% of 5000
    expect(mockCancelPaymentIntent).not.toHaveBeenCalled();
  });

  it('200 — barber cancels <24h before: full refund via cancel PI', async () => {
    const soonBooking = {
      ...BOOKING,
      scheduledAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      status: 'pending',
    };
    const cancelled = { ...soonBooking, status: 'cancelled' };
    mockBookingFindUnique.mockResolvedValue(soonBooking);
    mockCancelPaymentIntent.mockResolvedValue({});
    mockBookingUpdate.mockResolvedValue(cancelled);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(mockCancelPaymentIntent).toHaveBeenCalledWith(STRIPE_PI_ID);
    expect(mockCapturePaymentIntent).not.toHaveBeenCalled();
    expect(mockRefundPaymentIntent).not.toHaveBeenCalled();
  });

  it('422 — cannot cancel completed booking', async () => {
    mockBookingFindUnique.mockResolvedValue({ ...BOOKING, status: 'completed' });

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(422);
  });

  it('422 — cannot cancel already cancelled booking', async () => {
    mockBookingFindUnique.mockResolvedValue({ ...BOOKING, status: 'cancelled' });

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(422);
  });

  it('403 — other consumer cannot cancel', async () => {
    const otherConsumerToken = signAccessToken({ sub: 'other-consumer-id', role: 'consumer' });
    mockBookingFindUnique.mockResolvedValue(BOOKING);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${otherConsumerToken}`);

    expect(res.status).toBe(403);
  });

  it('200 — cancel without PI updates status only', async () => {
    const bookingNoPi = { ...BOOKING, stripePaymentIntentId: null };
    const cancelled = { ...bookingNoPi, status: 'cancelled' };
    mockBookingFindUnique.mockResolvedValue(bookingNoPi);
    mockBookingUpdate.mockResolvedValue(cancelled);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/cancel`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(mockCancelPaymentIntent).not.toHaveBeenCalled();
  });
});

// ── PATCH /bookings/:id/complete ──────────────────────────────────────────────

describe('PATCH /api/v1/bookings/:id/complete', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockCapturePaymentIntent.mockResolvedValue({});
    mockEnqueueReviewRequest.mockResolvedValue(undefined);
    mockBarberProfileUpdate.mockResolvedValue({});
  });

  it('200 — barber completes and enqueues review request', async () => {
    const completed = { ...BOOKING, status: 'completed', stripeTransferId: null };
    mockBookingFindUnique.mockResolvedValue({
      ...BOOKING,
      status: 'confirmed',
      studio: null,
    });
    mockPrismaTransaction.mockImplementation((args: unknown) =>
      Array.isArray(args) ? Promise.all(args) : Promise.reject(new Error('Expected array'))
    );
    mockBookingUpdate.mockResolvedValue(completed);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/complete`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('completed');
    expect(mockCapturePaymentIntent).toHaveBeenCalledWith(STRIPE_PI_ID);
    expect(mockEnqueueReviewRequest).toHaveBeenCalledWith(
      { bookingId: BOOKING_ID, consumerId: CONSUMER_ID, barberId: BARBER_PROFILE_ID },
      2 * 60 * 60 * 1000
    );
  });

  it('200 — creates transfer to studio when studioId set', async () => {
    const completed = {
      ...BOOKING,
      status: 'completed',
      studioId: STUDIO_ID,
      studioPayoutCents: 250,
      stripeTransferId: 'tr_xyz',
    };
    mockBookingFindUnique.mockResolvedValue({
      ...BOOKING,
      studioId: STUDIO_ID,
      studioPayoutCents: 250,
      status: 'confirmed',
      studio: { stripeAccountId: 'acct_studio123' },
    });
    mockCreateTransfer.mockResolvedValue({ id: 'tr_xyz' });
    mockPrismaTransaction.mockImplementation((arr: unknown) => {
      if (Array.isArray(arr)) {
        return Promise.all(arr);
      }
      return (arr as (tx: unknown) => Promise<unknown[]>)(prisma).then((a: unknown[]) =>
        Promise.all(a)
      );
    });
    mockBookingUpdate.mockResolvedValue(completed);

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/complete`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(mockCreateTransfer).toHaveBeenCalledWith(
      250,
      'acct_studio123',
      expect.objectContaining({ bookingId: BOOKING_ID })
    );
  });

  it('422 — cannot complete non-confirmed booking', async () => {
    mockBookingFindUnique.mockResolvedValue({ ...BOOKING, status: 'pending', studio: null });

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/complete`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(422);
  });

  it('403 — consumer cannot complete', async () => {
    mockBookingFindUnique.mockResolvedValue({ ...BOOKING, status: 'confirmed', studio: null });

    const res = await request(buildApp())
      .patch(`/api/v1/bookings/${BOOKING_ID}/complete`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
  });
});

// ── POST /bookings/:id/review ──────────────────────────────────────────────────

describe('POST /api/v1/bookings/:id/review', () => {
  const completedBooking = {
    ...BOOKING,
    status: 'completed',
    reviewedAt: null,
  };

  beforeEach(() => {
    mockPrismaQueryRaw.mockResolvedValue([{ avg: 4.5 }]);
    mockBookingCount.mockResolvedValue(1);
  });

  it('200 — consumer submits review and barber rating updated', async () => {
    const updated = {
      ...completedBooking,
      cutRating: 5,
      experienceRating: 4,
      reviewText: 'Great cut!',
      reviewedAt: new Date(),
    };
    mockBookingFindUnique
      .mockResolvedValueOnce(completedBooking)
      .mockResolvedValueOnce(updated);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/review`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ cutRating: 5, experienceRating: 4, reviewText: 'Great cut!' });

    expect(res.status).toBe(200);
    expect(res.body.data.booking.cutRating).toBe(5);
    expect(res.body.data.booking.experienceRating).toBe(4);
    expect(res.body.data.booking.reviewText).toBe('Great cut!');
  });

  it('422 — cannot review already reviewed booking', async () => {
    mockBookingFindUnique.mockResolvedValue({
      ...completedBooking,
      reviewedAt: new Date(),
    });

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/review`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ cutRating: 5, experienceRating: 5 });

    expect(res.status).toBe(422);
  });

  it('422 — cannot review non-completed booking', async () => {
    mockBookingFindUnique.mockResolvedValue({ ...BOOKING, status: 'pending' });

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/review`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ cutRating: 5, experienceRating: 5 });

    expect(res.status).toBe(422);
  });

  it('403 — barber cannot submit review', async () => {
    mockBookingFindUnique.mockResolvedValue(completedBooking);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/review`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ cutRating: 5, experienceRating: 5 });

    expect(res.status).toBe(403);
  });

  it('400 — invalid rating (out of range)', async () => {
    mockBookingFindUnique.mockResolvedValue(completedBooking);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/review`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ cutRating: 6, experienceRating: 5 });

    expect(res.status).toBe(400);
  });
});

// ── GET /bookings/barber/upcoming ───────────────────────────────────────────────

describe('GET /api/v1/bookings/barber/upcoming', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
  });

  it('200 — returns upcoming pending/confirmed bookings', async () => {
    const upcoming = [
      { ...BOOKING, id: 'b1', scheduledAt: new Date(Date.now() + 3600000) },
      { ...BOOKING, id: 'b2', scheduledAt: new Date(Date.now() + 7200000) },
    ];
    mockBookingFindMany.mockResolvedValue(upcoming);

    const res = await request(buildApp())
      .get('/api/v1/bookings/barber/upcoming')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(2);
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          barberId: BARBER_PROFILE_ID,
          status: { in: ['pending', 'confirmed'] },
          scheduledAt: { gt: expect.any(Date) },
        },
        orderBy: { scheduledAt: 'asc' },
      })
    );
  });

  it('404 — barber profile not found', async () => {
    mockBarberFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/v1/bookings/barber/upcoming')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(404);
  });
});

// ── GET /bookings/barber/history ───────────────────────────────────────────────

describe('GET /api/v1/bookings/barber/history', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
  });

  it('200 — returns paginated completed/cancelled bookings', async () => {
    const history = [
      { ...BOOKING, id: 'b1', status: 'completed', scheduledAt: new Date('2025-01-15') },
      { ...BOOKING, id: 'b2', status: 'cancelled', scheduledAt: new Date('2025-01-10') },
    ];
    mockBookingFindMany.mockResolvedValue(history);
    mockBookingCount.mockResolvedValue(2);

    const res = await request(buildApp())
      .get('/api/v1/bookings/barber/history')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(2);
    expect(res.body.meta.pagination.total).toBe(2);
    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          barberId: BARBER_PROFILE_ID,
          status: { in: ['completed', 'cancelled'] },
        },
        orderBy: { scheduledAt: 'desc' },
      })
    );
  });

  it('respects page and limit query params', async () => {
    mockBookingFindMany.mockResolvedValue([]);
    mockBookingCount.mockResolvedValue(50);

    await request(buildApp())
      .get('/api/v1/bookings/barber/history?page=2&limit=10')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockBookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    );
  });
});
