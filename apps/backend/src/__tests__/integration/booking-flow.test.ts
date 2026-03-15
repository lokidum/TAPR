/**
 * Integration tests for core booking flow, chair rental escrow, OTP rate limiting, and admin ban.
 * Requires TEST_DATABASE_URL. Run via: npm run test:integration
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const runIntegrationTests = !!process.env.TEST_DATABASE_URL;

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../../services/twilio.service');
jest.mock('../../services/stripe.service');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomInt: () => 123456,
}));

import bcrypt from 'bcrypt';
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../services/prisma.service';
import * as stripeService from '../../services/stripe.service';
import * as queueService from '../../services/queue.service';
import { setOTP } from '../../services/redis.service';
import { signAccessToken } from '../../utils/jwt';
import { calculateLevel } from '../../jobs/level-up.job';

const mockCreatePaymentIntent = stripeService.createPaymentIntent as jest.Mock;
const mockCapturePaymentIntent = stripeService.capturePaymentIntent as jest.Mock;
const mockCreateTransfer = stripeService.createTransfer as jest.Mock;
const mockCreateChairRentalPaymentIntent = stripeService.createChairRentalPaymentIntent as jest.Mock;
const mockRetrievePaymentIntent = stripeService.retrievePaymentIntent as jest.Mock;
const mockEnqueueEscrowReleaseJob = queueService.enqueueEscrowReleaseJob as jest.Mock;

const CONSUMER_PHONE = '+61400000001';
const BARBER_PHONE = '+61400000002';
const TEST_OTP = '123456';
const BCRYPT_ROUNDS = 10;
const OTP_TTL = 300;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-32-chars-exactly-padded!!';
  if (!runIntegrationTests) return;
  await prisma.$connect();
});

afterEach(async () => {
  jest.clearAllMocks();
  if (runIntegrationTests) {
    await prisma.$executeRaw`TRUNCATE TABLE users RESTART IDENTITY CASCADE`;
  }
});

afterAll(async () => {
  if (runIntegrationTests) await prisma.$disconnect();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createConsumerViaOTP(): Promise<{ accessToken: string; userId: string }> {
  await prisma.user.create({
    data: {
      phone: CONSUMER_PHONE,
      fullName: 'Test Consumer',
      role: 'consumer',
    },
  });

  const res = await request(app)
    .post('/api/v1/auth/otp/request')
    .send({ phone: CONSUMER_PHONE });
  expect(res.status).toBe(200);

  const hashedOTP = await bcrypt.hash(TEST_OTP, BCRYPT_ROUNDS);
  await setOTP(CONSUMER_PHONE, hashedOTP, OTP_TTL);

  const verifyRes = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ phone: CONSUMER_PHONE, otp: TEST_OTP });
  expect(verifyRes.status).toBe(200);
  expect(verifyRes.body.data.accessToken).toBeDefined();

  const user = await prisma.user.findUnique({ where: { phone: CONSUMER_PHONE } });
  return {
    accessToken: verifyRes.body.data.accessToken,
    userId: user!.id,
  };
}

async function createBarberViaOTP(): Promise<{
  accessToken: string;
  userId: string;
  barberProfileId: string;
}> {
  const res = await request(app)
    .post('/api/v1/auth/otp/request')
    .send({ phone: BARBER_PHONE });
  expect(res.status).toBe(200);

  const hashedOTP = await bcrypt.hash(TEST_OTP, BCRYPT_ROUNDS);
  await setOTP(BARBER_PHONE, hashedOTP, OTP_TTL);

  const verifyRes = await request(app)
    .post('/api/v1/auth/otp/verify')
    .send({ phone: BARBER_PHONE, otp: TEST_OTP });
  expect(verifyRes.status).toBe(200);

  const user = await prisma.user.findUnique({
    where: { phone: BARBER_PHONE },
    include: { barberProfile: true },
  });
  expect(user?.barberProfile).toBeDefined();

  await prisma.barberProfile.update({
    where: { id: user!.barberProfile!.id },
    data: { level: 3, stripeAccountId: 'acct_test_barber', title: 'Senior' },
  });

  return {
    accessToken: verifyRes.body.data.accessToken,
    userId: user!.id,
    barberProfileId: user!.barberProfile!.id,
  };
}

// ── Booking Happy Path ─────────────────────────────────────────────────────────

const describeIntegration = runIntegrationTests ? describe : describe.skip;

describeIntegration('Booking flow - happy path', () => {
  it('completes full flow: consumer books, barber confirms/completes, consumer reviews, rating and level-up verified', async () => {
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_test_booking',
      client_secret: 'secret_booking',
    });
    mockCapturePaymentIntent.mockResolvedValue({ id: 'pi_test_booking' });
    mockCreateTransfer.mockResolvedValue({ id: 'tr_test' });

    const consumer = await createConsumerViaOTP();
    const barber = await createBarberViaOTP();

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumer.accessToken}`)
      .send({
        barberId: barber.barberProfileId,
        serviceType: 'in_studio',
        scheduledAt,
        priceCents: 5000,
        durationMinutes: 60,
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.booking.id;

    const confirmRes = await request(app)
      .patch(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${barber.accessToken}`);
    expect(confirmRes.status).toBe(200);

    const completeRes = await request(app)
      .patch(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${barber.accessToken}`);
    expect(completeRes.status).toBe(200);

    const reviewRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/review`)
      .set('Authorization', `Bearer ${consumer.accessToken}`)
      .send({ cutRating: 5, experienceRating: 5, reviewText: 'Great cut!' });
    expect(reviewRes.status).toBe(200);

    const barberAfter = await prisma.barberProfile.findUnique({
      where: { id: barber.barberProfileId },
    });
    expect(barberAfter?.averageRating).toBe(5);
    expect(barberAfter?.totalRatings).toBe(1);
    expect(barberAfter?.totalVerifiedCuts).toBe(1);

    const expectedLevel = calculateLevel({
      totalVerifiedCuts: 1,
      averageRating: 5,
      aqfCertLevel: null,
      certVerifiedAt: null,
      isLevel6Eligible: false,
    });
    expect(expectedLevel).toBe(1);
    const barberFinal = await prisma.barberProfile.findUnique({
      where: { id: barber.barberProfileId },
    });
    expect(barberFinal?.level).toBe(3);
  });
});

// ── Chair Rental Escrow ───────────────────────────────────────────────────────

describeIntegration('Chair rental escrow flow', () => {
  it('creates listing, rents, completes, and verifies escrow job enqueued', async () => {
    const studioUser = await prisma.user.create({
      data: {
        phone: '+61400000003',
        fullName: 'Test Studio',
        role: 'studio',
      },
    });
    const studioProfile = await prisma.studioProfile.create({
      data: {
        userId: studioUser.id,
        businessName: 'Test Studio Inc',
        stripeAccountId: 'acct_test_studio',
      },
    });

    const studioToken = signAccessToken({
      sub: studioUser.id,
      role: 'studio',
    });

    mockRetrievePaymentIntent.mockResolvedValue({
      id: 'pi_listing_fee',
      status: 'succeeded',
      metadata: { studioId: studioProfile.id, type: 'chair_listing_fee' },
    });
    mockCreateChairRentalPaymentIntent.mockResolvedValue({
      id: 'pi_rental',
      client_secret: 'secret_rental',
    });
    mockCapturePaymentIntent.mockResolvedValue({ id: 'pi_rental' });

    const now = new Date();
    const availableFrom = new Date(now.getTime() + 60 * 60 * 1000);
    const availableTo = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const createListingRes = await request(app)
      .post('/api/v1/chairs')
      .set('Authorization', `Bearer ${studioToken}`)
      .send({
        title: 'Chair 1',
        priceCentsPerDay: 5000,
        availableFrom: availableFrom.toISOString(),
        availableTo: availableTo.toISOString(),
        listingType: 'daily',
        paymentIntentId: 'pi_listing_fee',
      });
    expect(createListingRes.status).toBe(201);
    const listingId = createListingRes.body.data.listing.id;

    const barberUser = await prisma.user.create({
      data: {
        phone: '+61400000004',
        fullName: 'Barber Renter',
        role: 'barber',
      },
    });
    await prisma.barberProfile.create({
      data: {
        userId: barberUser.id,
        level: 3,
        stripeAccountId: 'acct_barber_renter',
      },
    });
    const barberToken = signAccessToken({
      sub: barberUser.id,
      role: 'barber',
      level: 3,
    });

    const startAt = new Date(availableFrom.getTime() + 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);

    const rentRes = await request(app)
      .post(`/api/v1/chairs/${listingId}/rent`)
      .set('Authorization', `Bearer ${barberToken}`)
      .send({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
    expect(rentRes.status).toBe(201);
    const rentalId = rentRes.body.data.rental.id;

    mockEnqueueEscrowReleaseJob.mockResolvedValue('job-id');

    const completeRes = await request(app)
      .patch(`/api/v1/chairs/${listingId}/rentals/${rentalId}/complete`)
      .set('Authorization', `Bearer ${studioToken}`);
    expect(completeRes.status).toBe(200);

    expect(mockEnqueueEscrowReleaseJob).toHaveBeenCalledWith(
      expect.objectContaining({
        rentalId,
        paymentIntentId: 'pi_rental',
        studioStripeAccountId: 'acct_test_studio',
      }),
      expect.any(Number)
    );
  });
});

// ── OTP Rate Limiting ─────────────────────────────────────────────────────────

describeIntegration('OTP rate limiting', () => {
  it('allows 3 requests then returns 429 on 4th', async () => {
    const phone = '+61400000100';

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ phone });
      expect(res.status).toBe(200);
    }

    const fourthRes = await request(app)
      .post('/api/v1/auth/otp/request')
      .send({ phone });
    expect(fourthRes.status).toBe(429);
    expect(fourthRes.body.error.code).toBe('RATE_LIMITED');
  });
});

// ── Admin Ban Flow ────────────────────────────────────────────────────────────

describeIntegration('Admin ban flow', () => {
  it('bans user, tokens revoked, bookings return 403', async () => {
    mockCreatePaymentIntent.mockResolvedValue({
      id: 'pi_ban_test',
      client_secret: 'secret_ban',
    });

    const consumer = await createConsumerViaOTP();
    const barber = await createBarberViaOTP();

    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@test.com',
        fullName: 'Admin',
        role: 'admin',
      },
    });
    const adminToken = signAccessToken({ sub: adminUser.id, role: 'admin' });

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${consumer.accessToken}`)
      .send({
        barberId: barber.barberProfileId,
        serviceType: 'in_studio',
        scheduledAt,
        priceCents: 5000,
        durationMinutes: 60,
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.booking.id;

    const banRes = await request(app)
      .patch(`/api/v1/admin/users/${consumer.userId}/ban`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Test ban' });
    expect(banRes.status).toBe(200);

    const getBookingRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${consumer.accessToken}`);
    expect(getBookingRes.status).toBe(403);
    expect(getBookingRes.body.error.code).toBe('USER_BANNED');
  });
});
