jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    studioProfile: { findMany: jest.fn(), update: jest.fn() },
    barberProfile: { findMany: jest.fn() },
    booking: { findFirst: jest.fn(), update: jest.fn() },
    dispute: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../src/services/redis.service', () => ({
  isStripeEventProcessed: jest.fn(),
  setStripeEventProcessed: jest.fn(),
}));
jest.mock('../src/services/stripe.service', () => ({
  constructWebhookEvent: jest.fn(),
  retrieveCharge: jest.fn(),
}));
jest.mock('../src/services/queue.service', () => ({
  enqueueNotification: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import express from 'express';
import webhooksRouter from '../src/routes/webhooks.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import * as redisService from '../src/services/redis.service';
import * as stripeService from '../src/services/stripe.service';
import { prisma } from '../src/services/prisma.service';
import * as queueService from '../src/services/queue.service';

const mockIsStripeEventProcessed = redisService.isStripeEventProcessed as jest.Mock;
const mockSetStripeEventProcessed = redisService.setStripeEventProcessed as jest.Mock;
const mockConstructWebhookEvent = stripeService.constructWebhookEvent as jest.Mock;
const mockRetrieveCharge = stripeService.retrieveCharge as jest.Mock;
const mockStudioFindMany = (prisma.studioProfile as jest.Mocked<typeof prisma.studioProfile>)
  .findMany as jest.Mock;
const mockBarberFindMany = (prisma.barberProfile as jest.Mocked<typeof prisma.barberProfile>)
  .findMany as jest.Mock;
const mockBookingFindFirst = (prisma.booking as jest.Mocked<typeof prisma.booking>)
  .findFirst as jest.Mock;
const mockBookingUpdate = (prisma.booking as jest.Mocked<typeof prisma.booking>).update as jest.Mock;
const mockPrismaTransaction = (prisma as jest.Mocked<typeof prisma>).$transaction as jest.Mock;
const mockEnqueueNotification = queueService.enqueueNotification as jest.Mock;

function buildApp(): express.Express {
  const app = express();
  app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);
  app.use(errorHandler);
  return app;
}

function stripeEvent(type: string, object: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `evt_${type.replace(/\./g, '_')}_123`,
    type,
    data: { object },
    created: Math.floor(Date.now() / 1000),
  };
}

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
});

afterAll(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockIsStripeEventProcessed.mockResolvedValue(false);
  mockSetStripeEventProcessed.mockResolvedValue(undefined);
});

describe('POST /api/v1/webhooks/stripe', () => {
  it('400 — missing stripe-signature header', async () => {
    const payload = stripeEvent('account.updated', { id: 'acct_123' });
    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(400);
    expect(mockConstructWebhookEvent).not.toHaveBeenCalled();
  });

  it('400 — signature verification fails', async () => {
    mockConstructWebhookEvent.mockImplementation(() => {
      throw new Error('Signature verification failed');
    });

    const payload = stripeEvent('account.updated', { id: 'acct_123' });
    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=bad')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('200 — unhandled event type returns 200', async () => {
    const payload = stripeEvent('customer.created', { id: 'cus_123' });
    mockConstructWebhookEvent.mockReturnValue(payload);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
  });

  it('200 — duplicate event returns 200 with duplicate flag', async () => {
    mockIsStripeEventProcessed.mockResolvedValue(true);
    const payload = stripeEvent('account.updated', { id: 'acct_123' });
    mockConstructWebhookEvent.mockReturnValue(payload);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(mockSetStripeEventProcessed).not.toHaveBeenCalled();
  });

  it('account.updated — updates studio isVerified', async () => {
    const account = {
      id: 'acct_studio123',
      charges_enabled: true,
      payouts_enabled: true,
    };
    const payload = stripeEvent('account.updated', account);
    mockConstructWebhookEvent.mockReturnValue(payload);
    mockStudioFindMany.mockResolvedValue([{ id: 'studio-uuid' }]);
    mockBarberFindMany.mockResolvedValue([]);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(mockStudioFindMany).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_studio123' },
      select: { id: true },
    });
    expect(prisma.studioProfile.update).toHaveBeenCalledWith({
      where: { id: 'studio-uuid' },
      data: { isVerified: true },
    });
  });

  it('account.updated — isVerified false when charges disabled', async () => {
    const account = {
      id: 'acct_studio456',
      charges_enabled: false,
      payouts_enabled: true,
    };
    const payload = stripeEvent('account.updated', account);
    mockConstructWebhookEvent.mockReturnValue(payload);
    mockStudioFindMany.mockResolvedValue([{ id: 'studio-uuid-2' }]);
    mockBarberFindMany.mockResolvedValue([]);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(prisma.studioProfile.update).toHaveBeenCalledWith({
      where: { id: 'studio-uuid-2' },
      data: { isVerified: false },
    });
  });

  it('payment_intent.payment_failed — cancels booking', async () => {
    const pi = {
      id: 'pi_failed123',
      last_payment_error: { message: 'Card declined' },
    };
    const payload = stripeEvent('payment_intent.payment_failed', pi);
    mockConstructWebhookEvent.mockReturnValue(payload);
    mockBookingFindFirst.mockResolvedValue({ id: 'booking-uuid' });

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(mockBookingFindFirst).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_failed123' },
    });
    expect(mockBookingUpdate).toHaveBeenCalledWith({
      where: { id: 'booking-uuid' },
      data: { status: 'cancelled' },
    });
  });

  it('payment_intent.requires_action — logs and returns 200', async () => {
    const pi = { id: 'pi_3ds123', status: 'requires_action' };
    const payload = stripeEvent('payment_intent.requires_action', pi);
    mockConstructWebhookEvent.mockReturnValue(payload);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
  });

  it('charge.dispute.created — updates booking, creates dispute, enqueues notifications', async () => {
    const dispute = {
      id: 'dp_123',
      charge: 'ch_123',
      reason: 'fraudulent',
    };
    const payload = stripeEvent('charge.dispute.created', dispute);
    mockConstructWebhookEvent.mockReturnValue(payload);
    mockRetrieveCharge.mockResolvedValue({
      id: 'ch_123',
      payment_intent: 'pi_booking123',
    });
    mockBookingFindFirst.mockResolvedValue({
      id: 'booking-uuid',
      consumerId: 'consumer-uuid',
      barber: { userId: 'barber-user-uuid' },
    });
    mockPrismaTransaction.mockImplementation((fns: unknown[]) => Promise.all(fns));

    const res = await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(res.status).toBe(200);
    expect(mockRetrieveCharge).toHaveBeenCalledWith('ch_123');
    expect(mockBookingFindFirst).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: 'pi_booking123' },
      include: { consumer: true, barber: { include: { user: true } } },
    });
    expect(mockPrismaTransaction).toHaveBeenCalled();
    expect(mockEnqueueNotification).toHaveBeenCalledTimes(2);
    expect(mockEnqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'consumer-uuid',
        type: 'dispute_created',
        title: 'Payment dispute opened',
      })
    );
    expect(mockEnqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'barber-user-uuid',
        type: 'dispute_created',
      })
    );
  });

  it('idempotency — sets event as processed in Redis', async () => {
    const payload = stripeEvent('account.updated', { id: 'acct_123' });
    mockConstructWebhookEvent.mockReturnValue(payload);
    mockStudioFindMany.mockResolvedValue([]);
    mockBarberFindMany.mockResolvedValue([]);

    await request(buildApp())
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 't=123,v1=valid')
      .set('Content-Type', 'application/json')
      .send(Buffer.from(JSON.stringify(payload)));

    expect(mockSetStripeEventProcessed).toHaveBeenCalledWith('evt_account_updated_123');
  });
});
