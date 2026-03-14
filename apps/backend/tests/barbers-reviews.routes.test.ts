jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    barberProfile: {
      findUnique: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));
jest.mock('../src/services/storage.service');
jest.mock('../src/services/redis.service');

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import barbersRouter from '../src/routes/barbers.routes';
import { errorHandler } from '../src/middleware/errorHandler';

const mockBarberFindUnique = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>)
  .findUnique as jest.Mock;
const mockBookingFindMany = (prisma.booking as jest.Mocked<typeof prisma.booking>)
  .findMany as jest.Mock;
const mockBookingCount = (prisma.booking as jest.Mocked<typeof prisma.booking>)
  .count as jest.Mock;

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const BARBER_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

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

describe('GET /api/v1/barbers/:id/reviews', () => {
  const app = buildApp();

  it('returns 400 for invalid UUID', async () => {
    const res = await request(app).get('/api/v1/barbers/not-a-uuid/reviews');
    expect(res.status).toBe(400);
  });

  it('returns 404 when barber not found', async () => {
    mockBarberFindUnique.mockResolvedValueOnce(null);

    const res = await request(app).get(`/api/v1/barbers/${BARBER_ID}/reviews`);
    expect(res.status).toBe(404);
  });

  it('returns paginated reviews with privacy-safe consumer info', async () => {
    mockBarberFindUnique.mockResolvedValueOnce({ id: BARBER_ID });

    const reviewDate = new Date('2026-03-10T00:00:00Z');
    mockBookingFindMany.mockResolvedValueOnce([
      {
        id: 'booking-1',
        cutRating: 5,
        experienceRating: 4,
        reviewText: 'Great fade!',
        reviewedAt: reviewDate,
        consumer: {
          fullName: 'John Smith',
          avatarUrl: 'https://cdn.example.com/avatar.jpg',
        },
      },
    ]);
    mockBookingCount.mockResolvedValueOnce(1);

    const res = await request(app).get(`/api/v1/barbers/${BARBER_ID}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.data.reviews).toHaveLength(1);
    expect(res.body.data.reviews[0].consumer.firstName).toBe('John');
    expect(res.body.data.reviews[0].consumer.avatarUrl).toBe('https://cdn.example.com/avatar.jpg');
    expect(res.body.data.reviews[0].cutRating).toBe(5);
    expect(res.body.data.reviews[0].experienceRating).toBe(4);
    expect(res.body.data.reviews[0].reviewText).toBe('Great fade!');
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(20);
  });

  it('only exposes first name for privacy', async () => {
    mockBarberFindUnique.mockResolvedValueOnce({ id: BARBER_ID });
    mockBookingFindMany.mockResolvedValueOnce([
      {
        id: 'booking-2',
        cutRating: 3,
        experienceRating: 3,
        reviewText: null,
        reviewedAt: new Date(),
        consumer: {
          fullName: 'Jane Marie Doe',
          avatarUrl: null,
        },
      },
    ]);
    mockBookingCount.mockResolvedValueOnce(1);

    const res = await request(app).get(`/api/v1/barbers/${BARBER_ID}/reviews`);

    expect(res.body.data.reviews[0].consumer.firstName).toBe('Jane');
    expect(res.body.data.reviews[0].consumer).not.toHaveProperty('fullName');
  });

  it('returns empty array when no reviews exist', async () => {
    mockBarberFindUnique.mockResolvedValueOnce({ id: BARBER_ID });
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBookingCount.mockResolvedValueOnce(0);

    const res = await request(app).get(`/api/v1/barbers/${BARBER_ID}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.data.reviews).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('supports pagination params', async () => {
    mockBarberFindUnique.mockResolvedValueOnce({ id: BARBER_ID });
    mockBookingFindMany.mockResolvedValueOnce([]);
    mockBookingCount.mockResolvedValueOnce(25);

    const res = await request(app)
      .get(`/api/v1/barbers/${BARBER_ID}/reviews`)
      .query({ page: 2, limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(5);
  });

  it('handles consumer with null fullName gracefully', async () => {
    mockBarberFindUnique.mockResolvedValueOnce({ id: BARBER_ID });
    mockBookingFindMany.mockResolvedValueOnce([
      {
        id: 'booking-3',
        cutRating: 4,
        experienceRating: 5,
        reviewText: 'Nice',
        reviewedAt: new Date(),
        consumer: {
          fullName: null,
          avatarUrl: null,
        },
      },
    ]);
    mockBookingCount.mockResolvedValueOnce(1);

    const res = await request(app).get(`/api/v1/barbers/${BARBER_ID}/reviews`);

    expect(res.body.data.reviews[0].consumer.firstName).toBe('Anonymous');
  });
});
