jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    booking: { findUnique: jest.fn(), update: jest.fn() },
    dispute: { create: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/services/queue.service', () => ({
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import * as queueService from '../src/services/queue.service';
import bookingsRouter from '../src/routes/bookings.routes';
import disputesRouter, { attachBookingDisputeRoute } from '../src/routes/disputes.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

attachBookingDisputeRoute(bookingsRouter);

const mockBookingFindUnique = (prisma.booking as jest.Mocked<typeof prisma.booking>).findUnique as jest.Mock;
const mockBookingUpdate = (prisma.booking as jest.Mocked<typeof prisma.booking>).update as jest.Mock;
const mockDisputeCreate = (prisma.dispute as jest.Mocked<typeof prisma.dispute>).create as jest.Mock;
const mockDisputeFindMany = (prisma.dispute as jest.Mocked<typeof prisma.dispute>).findMany as jest.Mock;
const mockUserFindMany = (prisma.user as jest.Mocked<typeof prisma.user>).findMany as jest.Mock;
const mockPrismaTransaction = (prisma as jest.Mocked<typeof prisma>).$transaction as jest.Mock;
const mockEnqueueNotification = queueService.enqueueNotification as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/bookings', bookingsRouter);
  app.use('/api/v1/disputes', disputesRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const BOOKING_ID = 'booking-uuid-123';
const CONSUMER_ID = 'consumer-user-uuid';
const BARBER_USER_ID = 'barber-user-uuid';
const BARBER_PROFILE_ID = 'barber-profile-uuid';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrismaTransaction.mockImplementation((fns: unknown[]) => Promise.all(fns));
});

function consumerToken(): string {
  return signAccessToken({ sub: CONSUMER_ID, role: 'consumer' });
}

function barberToken(): string {
  return signAccessToken({ sub: BARBER_USER_ID, role: 'barber' });
}

const COMPLETED_BOOKING = {
  id: BOOKING_ID,
  consumerId: CONSUMER_ID,
  barberId: BARBER_PROFILE_ID,
  status: 'completed',
  updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  consumer: { id: CONSUMER_ID },
  barber: { user: { id: BARBER_USER_ID } },
};

describe('POST /api/v1/bookings/:id/dispute', () => {
  it('401 — requires auth', async () => {
    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .send({ reason: 'This is a valid reason with enough characters' });
    expect(res.status).toBe(401);
  });

  it('404 — booking not found', async () => {
    mockBookingFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ reason: 'This is a valid reason with enough characters' });

    expect(res.status).toBe(404);
  });

  it('403 — only consumer or barber can dispute', async () => {
    mockBookingFindUnique.mockResolvedValue(COMPLETED_BOOKING);
    const otherUserToken = signAccessToken({ sub: 'other-user-uuid', role: 'consumer' });

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${otherUserToken}`)
      .send({ reason: 'This is a valid reason with enough characters' });

    expect(res.status).toBe(403);
  });

  it('422 — cannot dispute if already disputed', async () => {
    mockBookingFindUnique.mockResolvedValue({
      ...COMPLETED_BOOKING,
      status: 'disputed',
    });

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ reason: 'This is a valid reason with enough characters' });

    expect(res.status).toBe(422);
  });

  it('422 — cannot dispute non-completed booking', async () => {
    mockBookingFindUnique.mockResolvedValue({
      ...COMPLETED_BOOKING,
      status: 'confirmed',
    });

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ reason: 'This is a valid reason with enough characters' });

    expect(res.status).toBe(422);
  });

  it('422 — cannot dispute booking older than 7 days', async () => {
    mockBookingFindUnique.mockResolvedValue({
      ...COMPLETED_BOOKING,
      updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ reason: 'This is a valid reason with enough characters' });

    expect(res.status).toBe(422);
  });

  it('400 — reason too short', async () => {
    mockBookingFindUnique.mockResolvedValue(COMPLETED_BOOKING);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ reason: 'Short' });

    expect(res.status).toBe(400);
  });

  it('201 — consumer raises dispute, notifies barber and admins', async () => {
    mockBookingFindUnique.mockResolvedValue(COMPLETED_BOOKING);
    mockDisputeCreate.mockResolvedValue({
      id: 'dispute-uuid',
      bookingId: BOOKING_ID,
      raisedById: CONSUMER_ID,
      againstId: BARBER_USER_ID,
      reason: 'This is a valid reason with enough characters',
      evidenceUrls: [],
    });
    mockUserFindMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({
        reason: 'This is a valid reason with enough characters',
        evidenceUrls: ['https://example.com/evidence1.pdf'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.dispute).toBeDefined();
    expect(mockPrismaTransaction).toHaveBeenCalled();
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      where: { id: BOOKING_ID },
      data: { status: 'disputed' },
    });
    expect(mockEnqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: BARBER_USER_ID,
        type: 'dispute_created',
        title: 'Booking dispute opened',
      })
    );
    expect(mockEnqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        type: 'dispute_created',
      })
    );
  });

  it('201 — barber raises dispute', async () => {
    mockBookingFindUnique.mockResolvedValue(COMPLETED_BOOKING);
    mockDisputeCreate.mockResolvedValue({
      id: 'dispute-uuid',
      bookingId: BOOKING_ID,
      raisedById: BARBER_USER_ID,
      againstId: CONSUMER_ID,
      reason: 'This is a valid reason with enough characters',
      evidenceUrls: [],
    });
    mockUserFindMany.mockResolvedValue([]);

    const res = await request(buildApp())
      .post(`/api/v1/bookings/${BOOKING_ID}/dispute`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ reason: 'This is a valid reason with enough characters' });

    expect(res.status).toBe(201);
    expect(mockEnqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CONSUMER_ID,
        type: 'dispute_created',
      })
    );
  });
});

describe('GET /api/v1/disputes/me', () => {
  it('401 — requires auth', async () => {
    const res = await request(buildApp()).get('/api/v1/disputes/me');
    expect(res.status).toBe(401);
  });

  it('200 — returns user disputes', async () => {
    const disputes = [
      {
        id: 'd1',
        raisedById: CONSUMER_ID,
        againstId: BARBER_USER_ID,
        reason: 'Test',
        status: 'open',
        rental: { id: BOOKING_ID },
        raisedBy: { fullName: 'Consumer', avatarUrl: null },
        against: { fullName: 'Barber', avatarUrl: null },
      },
    ];
    mockDisputeFindMany.mockResolvedValue(disputes);

    const res = await request(buildApp())
      .get('/api/v1/disputes/me')
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.disputes).toHaveLength(1);
    expect(mockDisputeFindMany).toHaveBeenCalledWith({
      where: { OR: [{ raisedById: CONSUMER_ID }, { againstId: CONSUMER_ID }] },
      include: expect.any(Object),
      orderBy: { createdAt: 'desc' },
    });
  });
});
