jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    deviceToken: { upsert: jest.fn() },
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import notificationsRouter from '../src/routes/notifications.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockUpsert = (prisma.deviceToken as jest.Mocked<typeof prisma.deviceToken>).upsert as jest.Mock;
const mockFindMany = (prisma.notification as jest.Mocked<typeof prisma.notification>).findMany as jest.Mock;
const mockCount = (prisma.notification as jest.Mocked<typeof prisma.notification>).count as jest.Mock;
const mockFindFirst = (prisma.notification as jest.Mocked<typeof prisma.notification>).findFirst as jest.Mock;
const mockUpdate = (prisma.notification as jest.Mocked<typeof prisma.notification>).update as jest.Mock;
const mockUpdateMany = (prisma.notification as jest.Mocked<typeof prisma.notification>).updateMany as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/notifications', notificationsRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';

function token(userId: string, role: string): string {
  return signAccessToken({ sub: userId, role: role as 'consumer' });
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/notifications/register-device', () => {
  it('200 — upserts device token', async () => {
    mockUpsert.mockResolvedValue({});

    const res = await request(buildApp())
      .post('/api/v1/notifications/register-device')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`)
      .send({ pushToken: 'fcm-token-xyz', platform: 'ios' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.registered).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { token: 'fcm-token-xyz' },
      create: { userId: 'user-1', token: 'fcm-token-xyz', platform: 'ios' },
      update: { userId: 'user-1', platform: 'ios' },
    });
  });

  it('200 — accepts android platform', async () => {
    mockUpsert.mockResolvedValue({});

    const res = await request(buildApp())
      .post('/api/v1/notifications/register-device')
      .set('Authorization', `Bearer ${token('user-1', 'barber')}`)
      .send({ pushToken: 'fcm-android', platform: 'android' });

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ platform: 'android' }),
      })
    );
  });

  it('401 — without auth', async () => {
    const res = await request(buildApp())
      .post('/api/v1/notifications/register-device')
      .send({ pushToken: 'token', platform: 'ios' });

    expect(res.status).toBe(401);
  });

  it('400 — invalid platform', async () => {
    const res = await request(buildApp())
      .post('/api/v1/notifications/register-device')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`)
      .send({ pushToken: 'token', platform: 'web' });

    expect(res.status).toBe(400);
  });

  it('400 — missing pushToken', async () => {
    const res = await request(buildApp())
      .post('/api/v1/notifications/register-device')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`)
      .send({ platform: 'ios' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/notifications', () => {
  it('200 — returns paginated notifications', async () => {
    const notifications = [
      {
        id: 'n1',
        userId: 'user-1',
        type: 'BOOKING',
        title: 'Booking confirmed',
        body: 'Your booking is confirmed',
        data: null,
        isRead: false,
        sentVia: ['push'],
        createdAt: new Date(),
      },
    ];
    mockFindMany.mockResolvedValue(notifications);
    mockCount.mockResolvedValue(1);

    const res = await request(buildApp())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Booking confirmed');
    expect(res.body.meta.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });

  it('200 — respects page and limit query params', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(50);

    const res = await request(buildApp())
      .get('/api/v1/notifications?page=2&limit=10')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`);

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    );
    expect(res.body.meta.pagination).toEqual({ page: 2, limit: 10, total: 50, totalPages: 5 });
  });

  it('401 — without auth', async () => {
    const res = await request(buildApp()).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('200 — marks notification as read', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'n1',
      userId: 'user-1',
      type: 'BOOKING',
      title: 'Test',
      body: 'Body',
      isRead: false,
    });
    mockUpdate.mockResolvedValue({});

    const res = await request(buildApp())
      .patch('/api/v1/notifications/n1/read')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { isRead: true },
    });
  });

  it('404 — notification not found or belongs to another user', async () => {
    mockFindFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch('/api/v1/notifications/n1/read')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('401 — without auth', async () => {
    const res = await request(buildApp()).patch('/api/v1/notifications/n1/read');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  it('200 — marks all notifications as read', async () => {
    mockUpdateMany.mockResolvedValue({ count: 5 });

    const res = await request(buildApp())
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${token('user-1', 'consumer')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(5);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRead: false },
      data: { isRead: true },
    });
  });

  it('401 — without auth', async () => {
    const res = await request(buildApp()).patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(401);
  });
});
