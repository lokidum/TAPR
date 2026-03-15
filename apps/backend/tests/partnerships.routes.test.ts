jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ isBanned: false }) },
    barberProfile: { findUnique: jest.fn(), findFirst: jest.fn() },
    partnership: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../src/services/docusign.service', () => ({
  createPartnershipEnvelope: jest.fn(),
}));
jest.mock('../src/services/redis.service', () => ({
  getBanned: jest.fn().mockResolvedValue(false),
  setBanned: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import { prisma } from '../src/services/prisma.service';
import * as docusignService from '../src/services/docusign.service';
import partnershipsRouter from '../src/routes/partnerships.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import { signAccessToken } from '../src/utils/jwt';

const mockBarberFindUnique = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>).findUnique as jest.Mock;
const mockPartnershipCreate = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).create as jest.Mock;
const mockPartnershipFindUnique = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).findUnique as jest.Mock;
const mockPartnershipFindMany = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).findMany as jest.Mock;
const mockPartnershipFindFirst = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).findFirst as jest.Mock;
const mockPartnershipCount = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).count as jest.Mock;
const mockPartnershipUpdate = (prisma.partnership as jest.Mocked<typeof prisma.partnership>).update as jest.Mock;
const mockCreatePartnershipEnvelope = docusignService.createPartnershipEnvelope as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/partnerships', partnershipsRouter);
  app.use(errorHandler);
  return app;
}

const JWT_SECRET = 'test-secret-32-chars-exactly-padded!!';

function token(userId: string, role: string): string {
  return signAccessToken({ sub: userId, role: role as 'barber' });
}

const INITIATOR_PROFILE = {
  id: 'a0000001-0000-0000-0000-000000000001',
  userId: 'b0000001-0000-0000-0000-000000000001',
  level: 5,
  user: { fullName: 'Initiator Barber', email: 'init@example.com' },
};

const PARTNER_PROFILE = {
  id: 'a0000002-0000-0000-0000-000000000002',
  userId: 'b0000002-0000-0000-0000-000000000002',
  level: 5,
  user: { fullName: 'Partner Barber', email: 'partner@example.com' },
};

const CREATED_PARTNERSHIP = {
  id: 'c0000001-0000-0000-0000-000000000001',
  initiatingBarberId: 'a0000001-0000-0000-0000-000000000001',
  partnerBarberId: 'a0000002-0000-0000-0000-000000000002',
  businessName: 'Biz Co',
  state: 'NSW',
  structureType: 'unincorporated_jv',
  equitySplitPctInitiator: 46,
  equitySplitPctPartner: 47,
  platformEquityPct: 7,
  vestingMonths: 48,
  cliffMonths: 12,
  status: 'draft',
  docusignEnvelopeId: null,
  initiatingBarber: { user: { fullName: 'Initiator Barber' } },
  partnerBarber: { user: { fullName: 'Partner Barber' } },
};

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = JWT_SECRET;
});

afterAll(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/partnerships', () => {
  it('201 — creates draft partnership when both barbers are Level 5+', async () => {
    mockBarberFindUnique
      .mockResolvedValueOnce(INITIATOR_PROFILE)
      .mockResolvedValueOnce(PARTNER_PROFILE);
    mockPartnershipCreate.mockResolvedValue(CREATED_PARTNERSHIP);

    const res = await request(buildApp())
      .post('/api/v1/partnerships')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`)
      .send({
        partnerBarberId: 'a0000002-0000-0000-0000-000000000002',
        businessName: 'Biz Co',
        state: 'NSW',
        structureType: 'unincorporated_jv',
        equitySplitInitiator: 46,
        equitySplitPartner: 47,
        platformEquityPct: 7,
        vestingMonths: 48,
        cliffMonths: 12,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('draft');
    expect(mockPartnershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          initiatingBarberId: 'a0000001-0000-0000-0000-000000000001',
          partnerBarberId: 'a0000002-0000-0000-0000-000000000002',
          businessName: 'Biz Co',
          state: 'NSW',
          structureType: 'unincorporated_jv',
          equitySplitPctInitiator: 46,
          equitySplitPctPartner: 47,
          platformEquityPct: 7,
          vestingMonths: 48,
          cliffMonths: 12,
          status: 'draft',
        }),
      })
    );
  });

  it('403 — when initiator is below Level 5', async () => {
    mockBarberFindUnique.mockResolvedValueOnce({
      ...INITIATOR_PROFILE,
      level: 4,
    });

    const res = await request(buildApp())
      .post('/api/v1/partnerships')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`)
      .send({
        partnerBarberId: 'a0000002-0000-0000-0000-000000000002',
        structureType: 'unincorporated_jv',
        equitySplitInitiator: 46,
        equitySplitPartner: 47,
        platformEquityPct: 7,
        vestingMonths: 48,
        cliffMonths: 12,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('403 — when partner is below Level 5', async () => {
    mockBarberFindUnique
      .mockResolvedValueOnce(INITIATOR_PROFILE)
      .mockResolvedValueOnce({ ...PARTNER_PROFILE, level: 3 });

    const res = await request(buildApp())
      .post('/api/v1/partnerships')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`)
      .send({
        partnerBarberId: 'a0000002-0000-0000-0000-000000000002',
        structureType: 'unincorporated_jv',
        equitySplitInitiator: 46,
        equitySplitPartner: 47,
        platformEquityPct: 7,
        vestingMonths: 48,
        cliffMonths: 12,
      });

    expect(res.status).toBe(403);
  });

  it('400 — when equity split does not sum to 100', async () => {
    mockBarberFindUnique
      .mockResolvedValueOnce(INITIATOR_PROFILE)
      .mockResolvedValueOnce(PARTNER_PROFILE);

    const res = await request(buildApp())
      .post('/api/v1/partnerships')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`)
      .send({
        partnerBarberId: 'a0000002-0000-0000-0000-000000000002',
        structureType: 'unincorporated_jv',
        equitySplitInitiator: 50,
        equitySplitPartner: 50,
        vestingMonths: 48,
        cliffMonths: 12,
      });

    expect(res.status).toBe(400);
  });

  it('401 — without auth', async () => {
    const res = await request(buildApp())
      .post('/api/v1/partnerships')
      .send({ partnerBarberId: 'partner-bp-id', structureType: 'unincorporated_jv' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/partnerships/:id/send', () => {
  it('200 — sends envelope and updates partnership', async () => {
    const partnershipWithStatus = {
      ...CREATED_PARTNERSHIP,
      status: 'draft',
      initiatingBarber: INITIATOR_PROFILE,
      partnerBarber: PARTNER_PROFILE,
    };
    mockPartnershipFindUnique.mockResolvedValue(partnershipWithStatus);
    mockCreatePartnershipEnvelope.mockResolvedValue({ envelopeId: 'env-123' });
    mockPartnershipUpdate.mockResolvedValue({
      ...CREATED_PARTNERSHIP,
      docusignEnvelopeId: 'env-123',
      status: 'sent',
    });

    const res = await request(buildApp())
      .post('/api/v1/partnerships/c0000001-0000-0000-0000-000000000001/send')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('sent');
    expect(res.body.data.docusignEnvelopeId).toBe('env-123');
    expect(mockCreatePartnershipEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        initiatorEmail: 'init@example.com',
        initiatorName: 'Initiator Barber',
        partnerEmail: 'partner@example.com',
        partnerName: 'Partner Barber',
      })
    );
  });

  it('403 — when non-initiator tries to send', async () => {
    mockPartnershipFindUnique.mockResolvedValue({
      ...CREATED_PARTNERSHIP,
      initiatingBarberId: 'a0000001-0000-0000-0000-000000000001',
      initiatingBarber: INITIATOR_PROFILE,
      partnerBarber: PARTNER_PROFILE,
    });

    const res = await request(buildApp())
      .post('/api/v1/partnerships/c0000001-0000-0000-0000-000000000001/send')
      .set('Authorization', `Bearer ${token('b0000002-0000-0000-0000-000000000002', 'barber')}`);

    expect(res.status).toBe(403);
    expect(mockCreatePartnershipEnvelope).not.toHaveBeenCalled();
  });

  it('422 — when partnership already sent', async () => {
    mockPartnershipFindUnique.mockResolvedValue({
      ...CREATED_PARTNERSHIP,
      status: 'sent',
      initiatingBarber: INITIATOR_PROFILE,
      partnerBarber: PARTNER_PROFILE,
    });

    const res = await request(buildApp())
      .post('/api/v1/partnerships/c0000001-0000-0000-0000-000000000001/send')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`);

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/partnerships/me', () => {
  it('200 — returns paginated partnerships for barber', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: 'a0000001-0000-0000-0000-000000000001' });
    mockPartnershipFindMany.mockResolvedValue([CREATED_PARTNERSHIP]);
    mockPartnershipCount.mockResolvedValue(1);

    const res = await request(buildApp())
      .get('/api/v1/partnerships/me')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.pagination).toBeDefined();
  });

  it('401 — without auth', async () => {
    const res = await request(buildApp()).get('/api/v1/partnerships/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/partnerships/:id', () => {
  it('200 — returns partnership when user is a party', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: 'a0000001-0000-0000-0000-000000000001' });
    mockPartnershipFindFirst.mockResolvedValue(CREATED_PARTNERSHIP);

    const res = await request(buildApp())
      .get('/api/v1/partnerships/c0000001-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${token('b0000001-0000-0000-0000-000000000001', 'barber')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('c0000001-0000-0000-0000-000000000001');
  });

  it('404 — when partnership not found or user not a party', async () => {
    mockBarberFindUnique.mockResolvedValue({ id: 'a0000003-0000-0000-0000-000000000003' });
    mockPartnershipFindFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/v1/partnerships/c0000001-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${token('b0000003-0000-0000-0000-000000000003', 'barber')}`);

    expect(res.status).toBe(404);
  });
});
