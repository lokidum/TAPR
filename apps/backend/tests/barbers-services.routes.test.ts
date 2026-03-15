jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ isBanned: false }) },
    barberProfile: {
      findUnique: jest.fn(),
    },
    barberService: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
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

const mockBarberProfileFindUnique = prisma.barberProfile.findUnique as jest.Mock;
const mockBarberServiceFindMany = prisma.barberService.findMany as jest.Mock;
const mockBarberServiceFindFirst = prisma.barberService.findFirst as jest.Mock;
const mockBarberServiceCreate = prisma.barberService.create as jest.Mock;
const mockBarberServiceUpdate = prisma.barberService.update as jest.Mock;
const mockBookingFindMany = prisma.booking.findMany as jest.Mock;

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const BARBER_USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const BARBER_PROFILE_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const SERVICE_ID = 'cccccccc-0000-0000-0000-000000000001';

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

function barberToken(): string {
  return signAccessToken({ sub: BARBER_USER_ID, role: 'barber' });
}

function consumerToken(): string {
  return signAccessToken({ sub: 'dddddddd-0000-0000-0000-000000000001', role: 'consumer' });
}

// ── GET /barbers/:id/services ────────────────────────────────────────────────

describe('GET /api/v1/barbers/:id/services', () => {
  const app = buildApp();

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app).get('/api/v1/barbers/not-a-uuid/services');
    expect(res.status).toBe(400);
  });

  it('returns 404 if barber not found', async () => {
    mockBarberProfileFindUnique.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/barbers/${BARBER_PROFILE_ID}/services`);
    expect(res.status).toBe(404);
  });

  it('returns active services ordered by price', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    const services = [
      { id: SERVICE_ID, name: 'Buzz Cut', durationMinutes: 30, priceCents: 3000, isActive: true },
      { id: 'cccccccc-0000-0000-0000-000000000002', name: 'Fade', durationMinutes: 45, priceCents: 5000, isActive: true },
    ];
    mockBarberServiceFindMany.mockResolvedValue(services);

    const res = await request(app).get(`/api/v1/barbers/${BARBER_PROFILE_ID}/services`);
    expect(res.status).toBe(200);
    expect(res.body.data.services).toHaveLength(2);
    expect(res.body.data.services[0].name).toBe('Buzz Cut');
  });
});

// ── POST /barbers/me/services ────────────────────────────────────────────────

describe('POST /api/v1/barbers/me/services', () => {
  const app = buildApp();

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/barbers/me/services')
      .send({ name: 'Cut', durationMinutes: 30, priceCents: 3000 });
    expect(res.status).toBe(401);
  });

  it('returns 403 for consumer role', async () => {
    const res = await request(app)
      .post('/api/v1/barbers/me/services')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ name: 'Cut', durationMinutes: 30, priceCents: 3000 });
    expect(res.status).toBe(403);
  });

  it('creates a service for authenticated barber', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    const created = {
      id: SERVICE_ID,
      barberId: BARBER_PROFILE_ID,
      name: 'Fade',
      description: null,
      durationMinutes: 45,
      priceCents: 5000,
      isActive: true,
    };
    mockBarberServiceCreate.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/v1/barbers/me/services')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ name: 'Fade', durationMinutes: 45, priceCents: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.data.service.name).toBe('Fade');
  });

  it('validates body fields', async () => {
    const res = await request(app)
      .post('/api/v1/barbers/me/services')
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ name: '', priceCents: -1 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ── PATCH /barbers/me/services/:serviceId ────────────────────────────────────

describe('PATCH /api/v1/barbers/me/services/:serviceId', () => {
  const app = buildApp();

  it('updates a service', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockBarberServiceFindFirst.mockResolvedValue({ id: SERVICE_ID, barberId: BARBER_PROFILE_ID });
    mockBarberServiceUpdate.mockResolvedValue({
      id: SERVICE_ID,
      name: 'Updated Name',
      priceCents: 6000,
    });

    const res = await request(app)
      .patch(`/api/v1/barbers/me/services/${SERVICE_ID}`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ name: 'Updated Name', priceCents: 6000 });

    expect(res.status).toBe(200);
    expect(res.body.data.service.name).toBe('Updated Name');
  });

  it('returns 404 for non-existent service', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockBarberServiceFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/barbers/me/services/${SERVICE_ID}`)
      .set('Authorization', `Bearer ${barberToken()}`)
      .send({ name: 'Test' });

    expect(res.status).toBe(404);
  });
});

// ── DELETE /barbers/me/services/:serviceId ───────────────────────────────────

describe('DELETE /api/v1/barbers/me/services/:serviceId', () => {
  const app = buildApp();

  it('soft-deletes a service', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockBarberServiceFindFirst.mockResolvedValue({ id: SERVICE_ID, barberId: BARBER_PROFILE_ID });
    mockBarberServiceUpdate.mockResolvedValue({ id: SERVICE_ID, isActive: false });

    const res = await request(app)
      .delete(`/api/v1/barbers/me/services/${SERVICE_ID}`)
      .set('Authorization', `Bearer ${barberToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app)
      .delete('/api/v1/barbers/me/services/not-uuid')
      .set('Authorization', `Bearer ${barberToken()}`);
    expect(res.status).toBe(400);
  });
});

// ── GET /barbers/:id/availability ────────────────────────────────────────────

describe('GET /api/v1/barbers/:id/availability', () => {
  const app = buildApp();

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app)
      .get('/api/v1/barbers/not-uuid/availability?date=2026-03-20');
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing date', async () => {
    const res = await request(app)
      .get(`/api/v1/barbers/${BARBER_PROFILE_ID}/availability`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 404 if barber not found', async () => {
    mockBarberProfileFindUnique.mockResolvedValue(null);
    const res = await request(app)
      .get(`/api/v1/barbers/${BARBER_PROFILE_ID}/availability?date=2026-03-20`);
    expect(res.status).toBe(404);
  });

  it('returns booked slots for a date', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockBookingFindMany.mockResolvedValue([
      { scheduledAt: new Date('2026-03-20T09:00:00.000Z'), durationMinutes: 30 },
      { scheduledAt: new Date('2026-03-20T14:00:00.000Z'), durationMinutes: 60 },
    ]);

    const res = await request(app)
      .get(`/api/v1/barbers/${BARBER_PROFILE_ID}/availability?date=2026-03-20`);

    expect(res.status).toBe(200);
    expect(res.body.data.slots).toHaveLength(2);
    expect(res.body.data.slots[0]).toEqual({ startTime: '09:00', endTime: '09:30' });
    expect(res.body.data.slots[1]).toEqual({ startTime: '14:00', endTime: '15:00' });
  });

  it('returns empty array when no bookings', async () => {
    mockBarberProfileFindUnique.mockResolvedValue({ id: BARBER_PROFILE_ID });
    mockBookingFindMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/barbers/${BARBER_PROFILE_ID}/availability?date=2026-03-20`);

    expect(res.status).toBe(200);
    expect(res.body.data.slots).toEqual([]);
  });
});
