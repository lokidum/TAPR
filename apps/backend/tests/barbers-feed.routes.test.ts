jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ isBanned: false }) },
    $queryRaw: jest.fn(),
    portfolioItem: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    portfolioLike: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/services/storage.service');
jest.mock('../src/services/redis.service', () => ({
  getBanned: jest.fn().mockResolvedValue(false),
  setBanned: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import barbersRouter from '../src/routes/barbers.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockPortfolioItemFindFirst = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>)
  .findFirst as jest.Mock;
const mockPortfolioItemFindUnique = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>)
  .findUnique as jest.Mock;
const mockPortfolioLikeFindUnique = (prisma.portfolioLike as jest.Mocked<typeof prisma.portfolioLike>)
  .findUnique as jest.Mock;

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const CONSUMER_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const BARBER_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const ITEM_ID = 'cccccccc-0000-0000-0000-000000000001';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/barbers', barbersRouter);
  app.use(errorHandler);
  return app;
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

function consumerToken(): string {
  return signAccessToken({ sub: CONSUMER_USER_ID, role: 'consumer' });
}

// ── GET /barbers/nearby/feed ───────────────────────────────────────────────────

describe('GET /api/v1/barbers/nearby/feed', () => {
  const app = buildApp();

  it('returns paginated feed items', async () => {
    const feedRows = [
      {
        id: ITEM_ID,
        media_type: 'video',
        cdn_url: 'https://cdn.example.com/video.mp4',
        thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        caption: 'Fresh fade',
        like_count: 10,
        view_count: 50,
        created_at: new Date('2026-03-01T00:00:00Z'),
        barber_id: BARBER_ID,
        barber_user_id: 'dddddddd-0000-0000-0000-000000000001',
        barber_full_name: 'Joe Barber',
        barber_avatar_url: null,
        barber_level: 3,
        barber_title: 'Senior',
        barber_is_on_call: false,
        distance_km: 2.5,
      },
    ];

    mockQueryRaw
      .mockResolvedValueOnce(feedRows)
      .mockResolvedValueOnce([{ count: BigInt(1) }]);

    const res = await request(app)
      .get('/api/v1/barbers/nearby/feed')
      .query({ lat: -33.87, lng: 151.21 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].barber.fullName).toBe('Joe Barber');
    expect(res.body.data.items[0].barber.level).toBe(3);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(10);
  });

  it('returns empty array when no items nearby', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);

    const res = await request(app)
      .get('/api/v1/barbers/nearby/feed')
      .query({ lat: -33.87, lng: 151.21 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('validates required lat/lng params', async () => {
    const res = await request(app)
      .get('/api/v1/barbers/nearby/feed')
      .query({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('supports pagination params', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: BigInt(0) }]);

    const res = await request(app)
      .get('/api/v1/barbers/nearby/feed')
      .query({ lat: -33.87, lng: 151.21, page: 2, limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(5);
  });
});

// ── POST /barbers/:barberId/portfolio/:itemId/like ─────────────────────────────

describe('POST /api/v1/barbers/:barberId/portfolio/:itemId/like', () => {
  const app = buildApp();

  it('requires authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`);

    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app)
      .post('/api/v1/barbers/not-a-uuid/portfolio/also-bad/like')
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(400);
  });

  it('returns 404 if item not found', async () => {
    mockPortfolioItemFindFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(404);
  });

  it('creates like and increments count', async () => {
    mockPortfolioItemFindFirst.mockResolvedValueOnce({ id: ITEM_ID, barberId: BARBER_ID });
    mockPortfolioLikeFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockResolvedValueOnce([{}, {}]);
    mockPortfolioItemFindUnique.mockResolvedValueOnce({ likeCount: 11 });

    const res = await request(app)
      .post(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likeCount).toBe(11);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('is idempotent — does not double-increment when already liked', async () => {
    mockPortfolioItemFindFirst.mockResolvedValueOnce({ id: ITEM_ID, barberId: BARBER_ID });
    mockPortfolioLikeFindUnique.mockResolvedValueOnce({ userId: CONSUMER_USER_ID, portfolioItemId: ITEM_ID });
    mockPortfolioItemFindUnique.mockResolvedValueOnce({ likeCount: 10 });

    const res = await request(app)
      .post(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likeCount).toBe(10);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

// ── DELETE /barbers/:barberId/portfolio/:itemId/like ────────────────────────────

describe('DELETE /api/v1/barbers/:barberId/portfolio/:itemId/like', () => {
  const app = buildApp();

  it('requires authentication', async () => {
    const res = await request(app)
      .delete(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`);

    expect(res.status).toBe(401);
  });

  it('returns 404 if item not found', async () => {
    mockPortfolioItemFindFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(404);
  });

  it('removes like and decrements count', async () => {
    mockPortfolioItemFindFirst.mockResolvedValueOnce({ id: ITEM_ID, barberId: BARBER_ID });
    mockPortfolioLikeFindUnique.mockResolvedValueOnce({ userId: CONSUMER_USER_ID, portfolioItemId: ITEM_ID });
    mockTransaction.mockResolvedValueOnce([{}, {}]);
    mockPortfolioItemFindUnique.mockResolvedValueOnce({ likeCount: 9 });

    const res = await request(app)
      .delete(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
    expect(res.body.data.likeCount).toBe(9);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it('is idempotent — does nothing if not liked', async () => {
    mockPortfolioItemFindFirst.mockResolvedValueOnce({ id: ITEM_ID, barberId: BARBER_ID });
    mockPortfolioLikeFindUnique.mockResolvedValueOnce(null);
    mockPortfolioItemFindUnique.mockResolvedValueOnce({ likeCount: 10 });

    const res = await request(app)
      .delete(`/api/v1/barbers/${BARBER_ID}/portfolio/${ITEM_ID}/like`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
    expect(res.body.data.likeCount).toBe(10);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
