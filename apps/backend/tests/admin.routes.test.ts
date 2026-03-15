jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: {
      findUnique: jest.fn().mockResolvedValue({ isBanned: false }),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    barberProfile: { findUnique: jest.fn(), update: jest.fn() },
    dispute: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    booking: { aggregate: jest.fn(), groupBy: jest.fn() },
    chairListing: { count: jest.fn() },
    partnership: { groupBy: jest.fn() },
  },
}));
jest.mock('../src/services/redis.service', () => ({
  deleteAllUserTokens: jest.fn().mockResolvedValue(undefined),
  getBanned: jest.fn().mockResolvedValue(false),
  setBanned: jest.fn().mockResolvedValue(undefined),
  deleteBanned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/stripe.service', () => ({
  refundPaymentIntent: jest.fn().mockResolvedValue({ id: 're_123' }),
}));
jest.mock('../src/services/queue.service', () => ({
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import * as redisService from '../src/services/redis.service';
import * as stripeService from '../src/services/stripe.service';
import * as queueService from '../src/services/queue.service';
import adminRouter from '../src/routes/admin.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockUserFindUnique = (prisma.user as jest.Mocked<typeof prisma.user>).findUnique as jest.Mock;
const mockUserFindMany = (prisma.user as jest.Mocked<typeof prisma.user>).findMany as jest.Mock;
const mockUserUpdate = (prisma.user as jest.Mocked<typeof prisma.user>).update as jest.Mock;
const mockUserCount = (prisma.user as jest.Mocked<typeof prisma.user>).count as jest.Mock;
const mockUserGroupBy = (prisma.user as jest.Mocked<typeof prisma.user>).groupBy as jest.Mock;
const mockBarberFindUnique = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>)
  .findUnique as jest.Mock;
const mockBarberUpdate = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).update as jest.Mock;
const mockDisputeFindUnique = (prisma.dispute as jest.Mocked<typeof prisma.dispute>).findUnique as jest.Mock;
const mockDisputeFindMany = (prisma.dispute as jest.Mocked<typeof prisma.dispute>).findMany as jest.Mock;
const mockDisputeCount = (prisma.dispute as jest.Mocked<typeof prisma.dispute>).count as jest.Mock;
const mockDisputeUpdate = (prisma.dispute as jest.Mocked<typeof prisma.dispute>).update as jest.Mock;
const mockBookingAggregate = (prisma.booking as jest.Mocked<typeof prisma.booking>).aggregate as jest.Mock;
const mockBookingGroupBy = (prisma.booking as jest.Mocked<typeof prisma.booking>).groupBy as jest.Mock;
const mockChairListingCount = (prisma.chairListing as jest.Mocked<typeof prisma.chairListing>).count as jest.Mock;
const mockPartnershipGroupBy = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).groupBy as jest.Mock;
const mockDeleteAllUserTokens = redisService.deleteAllUserTokens as jest.Mock;
const mockRefundPaymentIntent = stripeService.refundPaymentIntent as jest.Mock;
const mockEnqueueNotification = queueService.enqueueNotification as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const ADMIN_USER_ID = 'admin-user-uuid';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

function adminToken(): string {
  return signAccessToken({ sub: ADMIN_USER_ID, role: 'admin' });
}

function consumerToken(): string {
  return signAccessToken({ sub: 'consumer-uuid', role: 'consumer' });
}

describe('Admin routes — auth', () => {
  it('401 — requires auth', async () => {
    const res = await request(buildApp()).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('403 — requires admin role', async () => {
    const res = await request(buildApp())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${consumerToken()}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/admin/users', () => {
  it('200 — returns paginated users', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', email: 'a@b.com', fullName: 'Alice', role: 'consumer', isBanned: false },
    ]);
    mockUserCount.mockResolvedValue(1);

    const res = await request(buildApp())
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination).toBeDefined();
  });

  it('200 — filters by role and search', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockUserCount.mockResolvedValue(0);

    await request(buildApp())
      .get('/api/v1/admin/users')
      .query({ role: 'barber', search: 'john' })
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'barber',
          OR: expect.any(Array),
        }),
      })
    );
  });
});

describe('PATCH /api/v1/admin/users/:id/ban', () => {
  it('404 — user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch('/api/v1/admin/users/user-123/ban')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reason: 'Violation' });

    expect(res.status).toBe(404);
  });

  it('200 — bans user and revokes tokens', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user-123' });

    const res = await request(buildApp())
      .patch('/api/v1/admin/users/user-123/ban')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reason: 'Terms violation' });

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { isBanned: true, banReason: 'Terms violation' },
    });
    expect(mockDeleteAllUserTokens).toHaveBeenCalledWith('user-123');
  });
});

describe('PATCH /api/v1/admin/users/:id/unban', () => {
  it('200 — unbans user', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user-123' });

    const res = await request(buildApp())
      .patch('/api/v1/admin/users/user-123/unban')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: { isBanned: false, banReason: null },
    });
  });
});

describe('PATCH /api/v1/admin/barbers/:id/verify-cert', () => {
  it('200 — verifies cert', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: 'barber-123' });

    const res = await request(buildApp())
      .patch('/api/v1/admin/barbers/barber-123/verify-cert')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ aqfLevel: 'Certificate III' });

    expect(res.status).toBe(200);
    expect(mockBarberUpdate).toHaveBeenCalledWith({
      where: { id: 'barber-123' },
      data: expect.objectContaining({
        aqfCertLevel: 'Certificate III',
        certVerifiedAt: expect.any(Date),
      }),
    });
  });
});

describe('PATCH /api/v1/admin/barbers/:id/set-level', () => {
  it('200 — sets level 5', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: 'barber-123' });

    const res = await request(buildApp())
      .patch('/api/v1/admin/barbers/barber-123/set-level')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ level: 5 });

    expect(res.status).toBe(200);
    expect(mockBarberUpdate).toHaveBeenCalledWith({
      where: { id: 'barber-123' },
      data: { level: 5 },
    });
  });

  it('400 — level must be 5 or 6', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/admin/barbers/barber-123/set-level')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ level: 3 });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/admin/disputes', () => {
  it('200 — returns paginated disputes', async () => {
    mockDisputeFindMany.mockResolvedValue([]);
    mockDisputeCount.mockResolvedValue(0);

    const res = await request(buildApp())
      .get('/api/v1/admin/disputes')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/v1/admin/disputes/:id/resolve', () => {
  it('404 — dispute not found', async () => {
    mockDisputeFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch('/api/v1/admin/disputes/d1/resolve')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'resolved_for_claimant', notes: 'Refund issued' });

    expect(res.status).toBe(404);
  });

  it('200 — resolves for claimant, processes refund, notifies parties', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'd1',
      bookingId: 'b1',
      rentalId: null,
      raisedById: 'claimant',
      againstId: 'respondent',
      rental: {
        id: 'b1',
        stripePaymentIntentId: 'pi_123',
        priceCents: 5000,
      },
    });

    const res = await request(buildApp())
      .patch('/api/v1/admin/disputes/d1/resolve')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'resolved_for_claimant', notes: 'Refund issued' });

    expect(res.status).toBe(200);
    expect(mockRefundPaymentIntent).toHaveBeenCalledWith('pi_123', 5000);
    expect(mockDisputeUpdate).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({
        status: 'resolved_for_claimant',
        resolutionNotes: 'Refund issued',
        adminId: ADMIN_USER_ID,
      }),
    });
    expect(mockEnqueueNotification).toHaveBeenCalledTimes(2);
  });

  it('200 — resolves for respondent, no refund', async () => {
    mockDisputeFindUnique.mockResolvedValue({
      id: 'd1',
      bookingId: 'b1',
      raisedById: 'claimant',
      againstId: 'respondent',
      rental: { id: 'b1', stripePaymentIntentId: 'pi_123', priceCents: 5000 },
    });

    const res = await request(buildApp())
      .patch('/api/v1/admin/disputes/d1/resolve')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'resolved_for_respondent', notes: 'No refund' });

    expect(res.status).toBe(200);
    expect(mockRefundPaymentIntent).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/metrics', () => {
  it('200 — returns metrics', async () => {
    mockUserGroupBy.mockResolvedValue([
      { role: 'consumer', _count: { id: 10 } },
      { role: 'barber', _count: { id: 5 } },
    ]);
    mockBookingGroupBy.mockResolvedValue([
      { status: 'completed', _count: { id: 20 } },
    ]);
    mockBookingAggregate.mockResolvedValue({ _sum: { priceCents: 100000 } });
    mockChairListingCount.mockResolvedValue(15);
    mockPartnershipGroupBy.mockResolvedValue([
      { status: 'fully_executed', _count: { id: 3 } },
    ]);

    const res = await request(buildApp())
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalUsersByRole).toBeDefined();
    expect(res.body.data.totalBookingsByStatus).toBeDefined();
    expect(res.body.data.totalRevenueThisMonthCents).toBe(100000);
    expect(res.body.data.totalActiveChairListings).toBe(15);
    expect(res.body.data.totalPartnershipsByStatus).toBeDefined();
  });
});
