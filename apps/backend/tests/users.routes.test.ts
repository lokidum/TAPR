jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock('../src/services/redis.service', () => ({
  deleteAllUserTokens: jest.fn(),
}));
jest.mock('../src/services/storage.service', () => ({
  generateUploadPresignedUrl: jest.fn().mockResolvedValue('https://s3.presigned.example/upload'),
  generateDownloadUrl: jest.fn().mockReturnValue('https://cdn.example.com/avatars/uuid/abc.jpg'),
}));

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/services/prisma.service';
import * as redisService from '../src/services/redis.service';
import usersRouter from '../src/routes/users.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockFindUnique = (prisma.user as jest.Mocked<typeof prisma.user>).findUnique as jest.Mock;
const mockUpdate = (prisma.user as jest.Mocked<typeof prisma.user>).update as jest.Mock;
const mockDeleteAllUserTokens = redisService.deleteAllUserTokens as jest.Mock;

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/users', usersRouter);
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
  mockDeleteAllUserTokens.mockResolvedValue(undefined);
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BARBER_USER = {
  id: 'barber-uuid',
  email: 'barber@example.com',
  phone: '+15551234567',
  role: 'barber' as const,
  fullName: 'Test Barber',
  appleUserId: null,
  googleUserId: null,
  avatarUrl: null,
  isActive: true,
  isBanned: false,
  banReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  barberProfile: {
    id: 'bp-uuid',
    userId: 'barber-uuid',
    level: 3,
    title: 'Senior',
    instagramAccessToken: 'secret-ig-token',
    tiktokAccessToken: 'secret-tt-token',
    bio: null,
    specialties: [],
    rating: null,
    reviewCount: 0,
    onCallEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const STUDIO_USER = {
  id: 'studio-uuid',
  email: 'studio@example.com',
  phone: null,
  role: 'studio' as const,
  fullName: 'Test Studio',
  appleUserId: null,
  googleUserId: null,
  avatarUrl: null,
  isActive: true,
  isBanned: false,
  banReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  studioProfile: {
    id: 'sp-uuid',
    userId: 'studio-uuid',
    name: 'Cool Studio',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const CONSUMER_USER = {
  id: 'consumer-uuid',
  email: 'consumer@example.com',
  phone: null,
  role: 'consumer' as const,
  fullName: 'Test Consumer',
  appleUserId: null,
  googleUserId: null,
  avatarUrl: null,
  isActive: true,
  isBanned: false,
  banReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function token(userId: string, role: string): string {
  return signAccessToken({ sub: userId, role: role as 'consumer' });
}

// ── GET /users/me ─────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me', () => {
  it('returns 200 with barberProfile for a barber (tokens stripped)', async () => {
    mockFindUnique.mockResolvedValue(BARBER_USER);

    const res = await request(buildApp())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('barber-uuid', 'barber')}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.barberProfile).toBeDefined();
    expect(res.body.data.barberProfile.instagramAccessToken).toBeUndefined();
    expect(res.body.data.barberProfile.tiktokAccessToken).toBeUndefined();
    expect(res.body.data.barberProfile.level).toBe(3);
  });

  it('returns 200 with studioProfile for a studio', async () => {
    mockFindUnique.mockResolvedValue(STUDIO_USER);

    const res = await request(buildApp())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('studio-uuid', 'studio')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.studioProfile).toBeDefined();
    expect(res.body.data.studioProfile.name).toBe('Cool Studio');
  });

  it('returns 200 without any profile for a consumer', async () => {
    mockFindUnique.mockResolvedValue(CONSUMER_USER);

    const res = await request(buildApp())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.barberProfile).toBeUndefined();
    expect(res.body.data.studioProfile).toBeUndefined();
  });

  it('returns 404 when user is not found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('barber-uuid', 'barber')}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp()).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});

// ── POST /users/me/avatar-upload-url ──────────────────────────────────────────

describe('POST /api/v1/users/me/avatar-upload-url', () => {
  it('returns 200 with uploadUrl, key, cdnUrl for valid image', async () => {
    const res = await request(buildApp())
      .post('/api/v1/users/me/avatar-upload-url')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ fileName: 'photo.jpg', mimeType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uploadUrl).toBeDefined();
    expect(res.body.data.key).toMatch(/^avatars\/consumer-uuid\/[a-f0-9-]+\.jpg$/);
    expect(res.body.data.cdnUrl).toBeDefined();
  });

  it('returns 400 for invalid mimeType', async () => {
    const res = await request(buildApp())
      .post('/api/v1/users/me/avatar-upload-url')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ fileName: 'photo.jpg', mimeType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .post('/api/v1/users/me/avatar-upload-url')
      .send({ fileName: 'photo.jpg', mimeType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });
});

// ── PATCH /users/me ───────────────────────────────────────────────────────────

describe('PATCH /api/v1/users/me', () => {
  it('returns 200 with updated fullName', async () => {
    const updated = { ...CONSUMER_USER, fullName: 'New Name' };
    mockUpdate.mockResolvedValue(updated);

    const res = await request(buildApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ fullName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe('New Name');
  });

  it('returns 200 with updated avatarUrl', async () => {
    const updated = { ...CONSUMER_USER, avatarUrl: 'https://example.com/avatar.jpg' };
    mockUpdate.mockResolvedValue(updated);

    const res = await request(buildApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ avatarUrl: 'https://example.com/avatar.jpg' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  it('returns 200 when avatarUrl is explicitly null (clears avatar)', async () => {
    const updated = { ...CONSUMER_USER, avatarUrl: null };
    mockUpdate.mockResolvedValue(updated);

    const res = await request(buildApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ avatarUrl: null });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBeNull();
  });

  it('returns 400 for invalid avatarUrl (not a URL)', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ avatarUrl: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty fullName', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`)
      .send({ fullName: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp())
      .patch('/api/v1/users/me')
      .send({ fullName: 'New Name' });

    expect(res.status).toBe(401);
  });
});

// ── GET /users/:id/public ─────────────────────────────────────────────────────

describe('GET /api/v1/users/:id/public', () => {
  const PUBLIC_DB_ROW = {
    id: 'consumer-uuid',
    fullName: 'Test Consumer',
    avatarUrl: null,
    role: 'consumer',
    createdAt: new Date(),
    isActive: true,
    isBanned: false,
  };

  it('returns 200 with only safe fields', async () => {
    mockFindUnique.mockResolvedValue(PUBLIC_DB_ROW);

    const res = await request(buildApp()).get('/api/v1/users/consumer-uuid/public');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('consumer-uuid');
    expect(res.body.data.fullName).toBe('Test Consumer');
    expect(res.body.data.role).toBe('consumer');
  });

  it('prisma is called with select that excludes email, phone, and token fields', async () => {
    mockFindUnique.mockResolvedValue(PUBLIC_DB_ROW);

    await request(buildApp()).get('/api/v1/users/consumer-uuid/public');

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ email: true, phone: true }),
      })
    );
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true, fullName: true, role: true }),
      })
    );
  });

  it('never exposes isActive or isBanned in the response', async () => {
    mockFindUnique.mockResolvedValue(PUBLIC_DB_ROW);

    const res = await request(buildApp()).get('/api/v1/users/consumer-uuid/public');

    expect(res.body.data.isActive).toBeUndefined();
    expect(res.body.data.isBanned).toBeUndefined();
  });

  it('returns 404 for an unknown user', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/v1/users/unknown-uuid/public');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a banned user', async () => {
    mockFindUnique.mockResolvedValue({ ...PUBLIC_DB_ROW, isBanned: true });

    const res = await request(buildApp()).get('/api/v1/users/consumer-uuid/public');

    expect(res.status).toBe(404);
  });

  it('returns 404 for an inactive user', async () => {
    mockFindUnique.mockResolvedValue({ ...PUBLIC_DB_ROW, isActive: false });

    const res = await request(buildApp()).get('/api/v1/users/consumer-uuid/public');

    expect(res.status).toBe(404);
  });
});

// ── DELETE /users/me ──────────────────────────────────────────────────────────

describe('DELETE /api/v1/users/me', () => {
  beforeEach(() => {
    mockUpdate.mockResolvedValue({ ...CONSUMER_USER, isActive: false, fullName: 'Deleted User' });
  });

  it('returns 200 and anonymizes the user', async () => {
    const res = await request(buildApp())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Account deleted');
  });

  it('calls prisma.update with anonymized fields', async () => {
    await request(buildApp())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'consumer-uuid' },
        data: expect.objectContaining({
          email: 'deleted_consumer-uuid@deleted.com',
          phone: null,
          fullName: 'Deleted User',
          isActive: false,
          avatarUrl: null,
          appleUserId: null,
          googleUserId: null,
        }),
      })
    );
  });

  it('calls deleteAllUserTokens with correct userId', async () => {
    await request(buildApp())
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token('consumer-uuid', 'consumer')}`);

    expect(mockDeleteAllUserTokens).toHaveBeenCalledWith('consumer-uuid');
  });

  it('returns 401 with no token', async () => {
    const res = await request(buildApp()).delete('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});
