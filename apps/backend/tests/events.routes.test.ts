jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    event: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    eventAttendee: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import eventsRouter from '../src/routes/events.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockEventCreate = (prisma.event as jest.Mocked<typeof prisma.event>).create as jest.Mock;
const mockEventFindUnique = (prisma.event as jest.Mocked<typeof prisma.event>).findUnique as jest.Mock;
const mockEventFindMany = (prisma.event as jest.Mocked<typeof prisma.event>).findMany as jest.Mock;
const mockEventCount = (prisma.event as jest.Mocked<typeof prisma.event>).count as jest.Mock;
const mockEventUpdate = (prisma.event as jest.Mocked<typeof prisma.event>).update as jest.Mock;
const mockEventAttendeeUpsert = (prisma.eventAttendee as jest.Mocked<typeof prisma.eventAttendee>)
  .upsert as jest.Mock;
const mockEventAttendeeDeleteMany = (prisma.eventAttendee as jest.Mocked<typeof prisma.eventAttendee>)
  .deleteMany as jest.Mock;
const mockExecuteRaw = (prisma as jest.Mocked<typeof prisma>).$executeRaw as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/events', eventsRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';
const STUDIO_USER_ID = 'studio-user-uuid';
const ORGANIZER_USER_ID = 'organizer-user-uuid';
const EVENT_ID = 'event-uuid-123';

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteRaw.mockResolvedValue(1);
});

function studioToken(): string {
  return signAccessToken({ sub: STUDIO_USER_ID, role: 'studio' });
}

function adminToken(): string {
  return signAccessToken({ sub: 'admin-user-uuid', role: 'admin' });
}

function organizerToken(): string {
  return signAccessToken({ sub: ORGANIZER_USER_ID, role: 'studio' });
}

function consumerToken(): string {
  return signAccessToken({ sub: 'consumer-user-uuid', role: 'consumer' });
}

const VALID_CREATE_BODY = {
  title: 'Barber Workshop 2025',
  description: 'Learn advanced techniques',
  eventType: 'workshop',
  locationAddress: '123 Main St, Sydney',
  lat: -33.8688,
  lng: 151.2093,
  startsAt: '2025-07-15T10:00:00Z',
  endsAt: '2025-07-15T18:00:00Z',
  maxAttendees: 50,
  ticketPriceCents: 2500,
  hasFoodTrucks: true,
};

const CREATED_EVENT = {
  id: EVENT_ID,
  studioId: null,
  organizerUserId: STUDIO_USER_ID,
  title: 'Barber Workshop 2025',
  description: 'Learn advanced techniques',
  eventType: 'workshop',
  locationAddress: '123 Main St, Sydney',
  startsAt: new Date('2025-07-15T10:00:00Z'),
  endsAt: new Date('2025-07-15T18:00:00Z'),
  maxAttendees: 50,
  ticketPriceCents: 2500,
  hasFoodTrucks: true,
  status: 'planning',
  studio: null,
};

describe('POST /api/v1/events', () => {
  it('401 — requires auth', async () => {
    const res = await request(buildApp())
      .post('/api/v1/events')
      .send(VALID_CREATE_BODY);
    expect(res.status).toBe(401);
  });

  it('403 — requires studio or admin role', async () => {
    const res = await request(buildApp())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send(VALID_CREATE_BODY);
    expect(res.status).toBe(403);
  });

  it('201 — creates event as studio', async () => {
    mockEventCreate.mockResolvedValue(CREATED_EVENT);
    mockEventFindUnique.mockResolvedValue({ ...CREATED_EVENT, studio: null });

    const res = await request(buildApp())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Barber Workshop 2025');
    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizerUserId: STUDIO_USER_ID,
          title: 'Barber Workshop 2025',
          eventType: 'workshop',
          status: 'planning',
        }),
      })
    );
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it('201 — creates event as admin', async () => {
    mockEventCreate.mockResolvedValue({ ...CREATED_EVENT, organizerUserId: 'admin-user-uuid' });
    mockEventFindUnique.mockResolvedValue({ ...CREATED_EVENT, organizerUserId: 'admin-user-uuid', studio: null });

    const res = await request(buildApp())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(201);
  });

  it('400 — invalid body (startsAt after endsAt)', async () => {
    const badBody = { ...VALID_CREATE_BODY, endsAt: '2025-07-14T18:00:00Z' };
    const res = await request(buildApp())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${studioToken()}`)
      .send(badBody);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/events', () => {
  it('200 — returns paginated events without geo', async () => {
    mockEventFindMany.mockResolvedValue([CREATED_EVENT]);
    mockEventCount.mockResolvedValue(1);

    const res = await request(buildApp()).get('/api/v1/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta?.pagination).toBeDefined();
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'cancelled' } }),
        orderBy: { startsAt: 'asc' },
      })
    );
  });

  it('200 — filters by type and date range', async () => {
    mockEventFindMany.mockResolvedValue([]);
    mockEventCount.mockResolvedValue(0);

    const res = await request(buildApp())
      .get('/api/v1/events')
      .query({ type: 'workshop', from: '2025-07-01T00:00:00Z', to: '2025-07-31T23:59:59Z' });

    expect(res.status).toBe(200);
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: 'workshop',
          startsAt: { gte: expect.any(Date) },
          endsAt: { lte: expect.any(Date) },
        }),
      })
    );
  });

  it('400 — lat without lng', async () => {
    const res = await request(buildApp()).get('/api/v1/events').query({ lat: -33.8688 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/events/:id', () => {
  it('200 — returns event with attendee count', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      studio: null,
      organizer: { fullName: 'Organizer', avatarUrl: null },
      _count: { attendees: 12 },
    });

    const res = await request(buildApp()).get(`/api/v1/events/${EVENT_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attendeeCount).toBe(12);
    expect(res.body.data.title).toBe('Barber Workshop 2025');
  });

  it('404 — event not found', async () => {
    mockEventFindUnique.mockResolvedValue(null);

    const res = await request(buildApp()).get('/api/v1/events/non-existent-id');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/events/:id/attend', () => {
  it('401 — requires auth', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      status: 'confirmed',
      maxAttendees: 50,
      _count: { attendees: 10 },
    });

    const res = await request(buildApp()).post(`/api/v1/events/${EVENT_ID}/attend`);
    expect(res.status).toBe(401);
  });

  it('200 — registers attendance', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      status: 'confirmed',
      maxAttendees: 50,
      _count: { attendees: 10 },
    });
    mockEventAttendeeUpsert.mockResolvedValue({});

    const res = await request(buildApp())
      .post(`/api/v1/events/${EVENT_ID}/attend`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.registered).toBe(true);
    expect(mockEventAttendeeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: EVENT_ID, userId: 'consumer-user-uuid' } },
        create: { eventId: EVENT_ID, userId: 'consumer-user-uuid' },
      })
    );
  });

  it('404 — event not found', async () => {
    mockEventFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .post(`/api/v1/events/${EVENT_ID}/attend`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(404);
  });

  it('422 — event cancelled', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      status: 'cancelled',
      _count: { attendees: 0 },
    });

    const res = await request(buildApp())
      .post(`/api/v1/events/${EVENT_ID}/attend`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(422);
    expect(mockEventAttendeeUpsert).not.toHaveBeenCalled();
  });

  it('422 — event at capacity', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      status: 'confirmed',
      maxAttendees: 10,
      _count: { attendees: 10 },
    });

    const res = await request(buildApp())
      .post(`/api/v1/events/${EVENT_ID}/attend`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(422);
    expect(mockEventAttendeeUpsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/events/:id/attend', () => {
  it('401 — requires auth', async () => {
    const res = await request(buildApp()).delete(`/api/v1/events/${EVENT_ID}/attend`);
    expect(res.status).toBe(401);
  });

  it('200 — removes attendance', async () => {
    mockEventAttendeeDeleteMany.mockResolvedValue({ count: 1 });

    const res = await request(buildApp())
      .delete(`/api/v1/events/${EVENT_ID}/attend`)
      .set('Authorization', `Bearer ${consumerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
    expect(mockEventAttendeeDeleteMany).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID, userId: 'consumer-user-uuid' },
    });
  });
});

describe('PATCH /api/v1/events/:id', () => {
  it('401 — requires auth', async () => {
    mockEventFindUnique.mockResolvedValue(CREATED_EVENT);

    const res = await request(buildApp())
      .patch(`/api/v1/events/${EVENT_ID}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(401);
  });

  it('403 — only organizer can update', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      organizerUserId: ORGANIZER_USER_ID,
    });

    const res = await request(buildApp())
      .patch(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${consumerToken()}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(403);
  });

  it('200 — organizer updates event', async () => {
    const updated = {
      ...CREATED_EVENT,
      organizerUserId: ORGANIZER_USER_ID,
      title: 'Updated Workshop Title',
      studio: null,
    };
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      organizerUserId: ORGANIZER_USER_ID,
    });
    mockEventUpdate.mockResolvedValue(updated);

    const res = await request(buildApp())
      .patch(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${organizerToken()}`)
      .send({ title: 'Updated Workshop Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Workshop Title');
    expect(mockEventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EVENT_ID },
        data: expect.objectContaining({ title: 'Updated Workshop Title' }),
      })
    );
  });

  it('422 — cannot set status to live directly', async () => {
    mockEventFindUnique.mockResolvedValue({
      ...CREATED_EVENT,
      organizerUserId: ORGANIZER_USER_ID,
    });

    const res = await request(buildApp())
      .patch(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${organizerToken()}`)
      .send({ status: 'live' });

    expect(res.status).toBe(422);
    expect(mockEventUpdate).not.toHaveBeenCalled();
  });

  it('404 — event not found', async () => {
    mockEventFindUnique.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch(`/api/v1/events/${EVENT_ID}`)
      .set('Authorization', `Bearer ${organizerToken()}`)
      .send({ title: 'Updated' });

    expect(res.status).toBe(404);
  });
});
