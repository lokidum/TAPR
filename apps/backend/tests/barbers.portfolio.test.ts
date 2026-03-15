jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ isBanned: false }) },
    barberProfile: {
      findUnique: jest.fn(),
    },
    portfolioItem: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));
jest.mock('../src/services/redis.service', () => ({
  publishToChannel: jest.fn(),
  getBanned: jest.fn().mockResolvedValue(false),
  setBanned: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/storage.service', () => ({
  generateUploadPresignedUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
  objectExists: jest.fn(),
  deleteObject: jest.fn(),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/services/prisma.service';
import * as storage from '../src/services/storage.service';
import barbersRouter from '../src/routes/barbers.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockBarberFindUnique = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).findUnique as jest.Mock;
const mockItemCreate = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>).create as jest.Mock;
const mockItemFindMany = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>).findMany as jest.Mock;
const mockItemFindFirst = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>).findFirst as jest.Mock;
const mockItemUpdate = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>).update as jest.Mock;
const mockItemDelete = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>).delete as jest.Mock;
const mockItemCount = (prisma.portfolioItem as jest.Mocked<typeof prisma.portfolioItem>).count as jest.Mock;
const mockGenerateUpload = storage.generateUploadPresignedUrl as jest.Mock;
const mockGenerateDownload = storage.generateDownloadUrl as jest.Mock;
const mockObjectExists = storage.objectExists as jest.Mock;
const mockDeleteObject = storage.deleteObject as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/barbers', barbersRouter);
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-secret-32-chars-exactly-padded!!';
  process.env.AWS_S3_BUCKET_NAME = 'test-bucket';
  process.env.CLOUDFRONT_DOMAIN = 'cdn.example.com';
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
  delete process.env.AWS_S3_BUCKET_NAME;
  delete process.env.CLOUDFRONT_DOMAIN;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function barberToken(userId = 'barber-uuid'): string {
  return signAccessToken({ sub: userId, role: 'barber' });
}

function consumerToken(): string {
  return signAccessToken({ sub: 'consumer-uuid', role: 'consumer' });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BARBER_PROFILE = { id: 'bp-uuid', userId: 'barber-uuid', level: 3 };

const PORTFOLIO_ITEM = {
  id: 'item-uuid',
  barberId: 'bp-uuid',
  mediaType: 'image',
  s3Key: 'portfolio/bp-uuid/some-uuid.jpg',
  cdnUrl: 'https://cdn.example.com/portfolio/bp-uuid/some-uuid.jpg',
  thumbnailUrl: null,
  caption: 'Great fade',
  tags: ['fade', 'clipper'],
  isFeatured: false,
  instagramMediaId: null,
  tiktokVideoId: null,
  viewCount: 0,
  likeCount: 0,
  linkedBookingId: null,
  createdAt: new Date('2025-06-01T10:00:00Z'),
};

// ── POST /barbers/me/portfolio/upload-url ─────────────────────────────────────

describe('POST /api/v1/barbers/me/portfolio/upload-url', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue(BARBER_PROFILE);
    mockGenerateUpload.mockResolvedValue('https://s3.presigned.url/...');
    mockGenerateDownload.mockReturnValue('https://cdn.example.com/portfolio/bp-uuid/some-uuid.jpg');
  });

  it('returns 200 with uploadUrl, key, and cdnUrl for an image', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'haircut.jpg', mimeType: 'image/jpeg', mediaType: 'image' });

    expect(res.status).toBe(200);
    expect(res.body.data.uploadUrl).toBe('https://s3.presigned.url/...');
    expect(typeof res.body.data.key).toBe('string');
    expect(res.body.data.key).toMatch(/^portfolio\/bp-uuid\//);
    expect(res.body.data.cdnUrl).toContain('cdn.example.com');
  });

  it('returns 200 for a video mimeType', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'clip.mp4', mimeType: 'video/mp4', mediaType: 'video' });

    expect(res.status).toBe(200);
    expect(res.body.data.key).toMatch(/\.mp4$/);
  });

  it('calls generateUploadPresignedUrl with correct mimeType', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'pic.png', mimeType: 'image/png', mediaType: 'image' });

    expect(mockGenerateUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^portfolio\/bp-uuid\//),
      'image/png',
      5   // 5 MB for images
    );
  });

  it('uses 500 MB max for video', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'reel.mp4', mimeType: 'video/mp4', mediaType: 'video' });

    expect(mockGenerateUpload).toHaveBeenCalledWith(
      expect.any(String),
      'video/mp4',
      500
    );
  });

  it('S3 key preserves the file extension', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'photo.webp', mimeType: 'image/webp', mediaType: 'image' });

    const key = mockGenerateUpload.mock.calls[0][0] as string;
    expect(key).toMatch(/\.webp$/);
  });

  it('returns 400 for a disallowed mimeType', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'script.exe', mimeType: 'application/octet-stream', mediaType: 'image' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when fileName is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ mimeType: 'image/jpeg', mediaType: 'image' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when barber profile does not exist', async () => {
    mockBarberFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ fileName: 'photo.jpg', mimeType: 'image/jpeg', mediaType: 'image' });

    expect(res.status).toBe(404);
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .send({ fileName: 'photo.jpg', mimeType: 'image/jpeg', mediaType: 'image' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio/upload-url')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ fileName: 'photo.jpg', mimeType: 'image/jpeg', mediaType: 'image' });

    expect(res.status).toBe(403);
  });
});

// ── POST /barbers/me/portfolio ────────────────────────────────────────────────

describe('POST /api/v1/barbers/me/portfolio', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue(BARBER_PROFILE);
    mockObjectExists.mockResolvedValue(true);
    mockGenerateDownload.mockReturnValue(PORTFOLIO_ITEM.cdnUrl);
    mockItemCreate.mockResolvedValue(PORTFOLIO_ITEM);
  });

  it('returns 201 with the created portfolio item', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ key: PORTFOLIO_ITEM.s3Key, mediaType: 'image', caption: 'Great fade', tags: ['fade'] });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('item-uuid');
    expect(res.body.data.cdnUrl).toBe(PORTFOLIO_ITEM.cdnUrl);
  });

  it('verifies the S3 object exists before creating the record', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ key: PORTFOLIO_ITEM.s3Key, mediaType: 'image' });

    expect(mockObjectExists).toHaveBeenCalledWith(PORTFOLIO_ITEM.s3Key);
  });

  it('creates the item with barberId from the barber profile (not userId)', async () => {
    await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ key: PORTFOLIO_ITEM.s3Key, mediaType: 'image', tags: ['fade'] });

    expect(mockItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ barberId: 'bp-uuid' }),
      })
    );
  });

  it('returns 422 when S3 object does not exist', async () => {
    mockObjectExists.mockResolvedValue(false);

    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ key: 'missing/key.jpg', mediaType: 'image' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_NOT_FOUND');
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  it('returns 400 when key is missing', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ mediaType: 'image' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid mediaType', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ key: 'some/key', mediaType: 'gif' });

    expect(res.status).toBe(400);
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/barbers/me/portfolio')
      .send({ key: 'k', mediaType: 'image' });

    expect(res.status).toBe(401);
  });
});

// ── GET /barbers/:id/portfolio ────────────────────────────────────────────────

describe('GET /api/v1/barbers/:id/portfolio', () => {
  const BARBER_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockItemFindMany.mockResolvedValue([PORTFOLIO_ITEM]);
    mockItemCount.mockResolvedValue(1);
  });

  it('returns 200 with items array and pagination meta', async () => {
    const res = await request(buildApp()).get(`/api/v1/barbers/${BARBER_ID}/portfolio`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(20);
  });

  it('each item includes cdnUrl', async () => {
    const res = await request(buildApp()).get(`/api/v1/barbers/${BARBER_ID}/portfolio`);

    expect(res.body.data.items[0].cdnUrl).toBe(PORTFOLIO_ITEM.cdnUrl);
  });

  it('is accessible without authentication', async () => {
    const res = await request(buildApp()).get(`/api/v1/barbers/${BARBER_ID}/portfolio`);
    expect(res.status).toBe(200);
  });

  it('respects page and limit query params', async () => {
    mockItemFindMany.mockResolvedValue([]);
    mockItemCount.mockResolvedValue(50);

    const res = await request(buildApp())
      .get(`/api/v1/barbers/${BARBER_ID}/portfolio`)
      .query({ page: '3', limit: '10' });

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(3);
    expect(res.body.data.limit).toBe(10);
    expect(mockItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it('orders by createdAt DESC', async () => {
    await request(buildApp()).get(`/api/v1/barbers/${BARBER_ID}/portfolio`);

    expect(mockItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } })
    );
  });

  it('returns 404 for a non-UUID id', async () => {
    const res = await request(buildApp()).get('/api/v1/barbers/not-a-uuid/portfolio');

    expect(res.status).toBe(404);
    expect(mockItemFindMany).not.toHaveBeenCalled();
  });

  it('returns 400 for limit > 100', async () => {
    const res = await request(buildApp())
      .get(`/api/v1/barbers/${BARBER_ID}/portfolio`)
      .query({ limit: '101' });

    expect(res.status).toBe(400);
  });
});

// ── PATCH /barbers/me/portfolio/:itemId ───────────────────────────────────────

describe('PATCH /api/v1/barbers/me/portfolio/:itemId', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue(BARBER_PROFILE);
    mockItemFindFirst.mockResolvedValue(PORTFOLIO_ITEM);
    mockItemUpdate.mockResolvedValue({ ...PORTFOLIO_ITEM, caption: 'Updated caption' });
  });

  it('returns 200 with updated caption', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ caption: 'Updated caption' });

    expect(res.status).toBe(200);
    expect(res.body.data.caption).toBe('Updated caption');
  });

  it('returns 200 when marking item as featured', async () => {
    mockItemUpdate.mockResolvedValue({ ...PORTFOLIO_ITEM, isFeatured: true });

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ isFeatured: true });

    expect(res.status).toBe(200);
  });

  it('returns 200 when clearing caption with null', async () => {
    mockItemUpdate.mockResolvedValue({ ...PORTFOLIO_ITEM, caption: null });

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ caption: null });

    expect(res.status).toBe(200);
  });

  it('verifies item ownership — queries with both itemId and barberId', async () => {
    await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ caption: 'hi' });

    expect(mockItemFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'item-uuid', barberId: 'bp-uuid' } })
    );
  });

  it('returns 404 when item does not belong to this barber', async () => {
    mockItemFindFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/other-uuid')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ caption: 'hi' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when caption exceeds 500 characters', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ caption: 'x'.repeat(501) });

    expect(res.status).toBe(400);
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .send({ caption: 'hi' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ caption: 'hi' });

    expect(res.status).toBe(403);
  });
});

// ── DELETE /barbers/me/portfolio/:itemId ──────────────────────────────────────

describe('DELETE /api/v1/barbers/me/portfolio/:itemId', () => {
  beforeEach(() => {
    mockBarberFindUnique.mockResolvedValue(BARBER_PROFILE);
    mockItemFindFirst.mockResolvedValue(PORTFOLIO_ITEM);
    mockDeleteObject.mockResolvedValue(undefined);
    mockItemDelete.mockResolvedValue(PORTFOLIO_ITEM);
  });

  it('returns 200 with success message', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Portfolio item deleted');
  });

  it('deletes from S3 before deleting from DB', async () => {
    await request(buildApp())
      .delete('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`);

    const s3Order = mockDeleteObject.mock.invocationCallOrder[0];
    const dbOrder = mockItemDelete.mock.invocationCallOrder[0];
    expect(s3Order).toBeLessThan(dbOrder);
  });

  it('deletes the correct S3 key', async () => {
    await request(buildApp())
      .delete('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockDeleteObject).toHaveBeenCalledWith(PORTFOLIO_ITEM.s3Key);
  });

  it('deletes the correct DB record', async () => {
    await request(buildApp())
      .delete('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(mockItemDelete).toHaveBeenCalledWith({ where: { id: 'item-uuid' } });
  });

  it('returns 404 when item not found or belongs to another barber', async () => {
    mockItemFindFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .delete('/api/v1/barbers/me/portfolio/other-uuid')
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(404);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp()).delete('/api/v1/barbers/me/portfolio/item-uuid');
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not barber', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/barbers/me/portfolio/item-uuid')
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(403);
  });
});
