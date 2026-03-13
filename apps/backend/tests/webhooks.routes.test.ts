jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('../src/services/prisma.service', () => ({
  prisma: {
    studioProfile: { findMany: jest.fn(), update: jest.fn() },
    barberProfile: { findMany: jest.fn() },
    booking: { findFirst: jest.fn(), update: jest.fn() },
    dispute: { create: jest.fn() },
    partnership: { findFirst: jest.fn(), update: jest.fn() },
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
jest.mock('../src/services/docusign.service', () => ({
  downloadSignedDocument: jest.fn(),
}));
jest.mock('../src/services/storage.service', () => ({
  uploadBuffer: jest.fn().mockResolvedValue(undefined),
  generateDownloadUrl: jest.fn((key: string) => `https://cdn.example.com/${key}`),
}));
jest.mock('../src/services/notifications.service', () => ({
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/docusign-webhook.service', () => ({
  verifyDocuSignHmac: jest.fn(),
}));

import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import webhooksRouter from '../src/routes/webhooks.routes';
import { errorHandler } from '../src/middleware/errorHandler';
import * as redisService from '../src/services/redis.service';
import * as stripeService from '../src/services/stripe.service';
import { prisma } from '../src/services/prisma.service';
import * as queueService from '../src/services/queue.service';
import * as docusignService from '../src/services/docusign.service';
import * as storageService from '../src/services/storage.service';
import * as notificationsService from '../src/services/notifications.service';
import * as docusignWebhookService from '../src/services/docusign-webhook.service';

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
const mockPartnershipFindFirst = (prisma.partnership as jest.Mocked<typeof prisma.partnership>)
  .findFirst as jest.Mock;
const mockPartnershipUpdate = (prisma.partnership as jest.Mocked<typeof prisma.partnership>)
  .update as jest.Mock;
const mockDownloadSignedDocument = docusignService.downloadSignedDocument as jest.Mock;
const mockUploadBuffer = storageService.uploadBuffer as jest.Mock;
const mockSendPushNotification = notificationsService.sendPushNotification as jest.Mock;
const mockVerifyDocuSignHmac = docusignWebhookService.verifyDocuSignHmac as jest.Mock;

function computeDocuSignHmac(rawBody: Buffer, key: string): string {
  return crypto.createHmac('sha256', key).update(rawBody).digest('base64');
}

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

const DOCUSIGN_HMAC_KEY = 'docusign-hmac-test-key-32chars!!';

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.DOCUSIGN_HMAC_KEY = DOCUSIGN_HMAC_KEY;
});

afterAll(() => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.DOCUSIGN_HMAC_KEY;
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

describe('POST /api/v1/webhooks/docusign', () => {
  it('400 — missing X-DocuSign-Signature-1 header', async () => {
    const payload = { envelopeId: 'env-123', status: 'completed' };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('400 — HMAC signature verification fails', async () => {
    const payload = { envelopeId: 'env-123', status: 'completed' };
    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('X-DocuSign-Signature-1', 'invalid-base64-signature')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(payload));

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('200 — envelope-completed: downloads PDF, uploads to S3, updates partnership, sends push', async () => {
    mockVerifyDocuSignHmac.mockReturnValue(true);
    const payload = {
      envelopeId: 'env-completed-123',
      status: 'completed',
      event: 'envelope-completed',
    };
    const bodyStr = JSON.stringify(payload);
    const rawBody = Buffer.from(bodyStr, 'utf8');
    const sig = computeDocuSignHmac(rawBody, DOCUSIGN_HMAC_KEY);

    const partnership = {
      id: 'partnership-uuid',
      docusignEnvelopeId: 'env-completed-123',
      initiatingBarber: { userId: 'init-user-id', user: { id: 'init-user-id' } },
      partnerBarber: { userId: 'partner-user-id', user: { id: 'partner-user-id' } },
    };
    mockPartnershipFindFirst.mockResolvedValue(partnership);
    mockDownloadSignedDocument.mockResolvedValue(Buffer.from('pdf-content'));

    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('X-DocuSign-Signature-1', sig)
      .set('Content-Type', 'application/json')
      .send(bodyStr);

    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
    expect(mockPartnershipFindFirst).toHaveBeenCalledWith({
      where: { docusignEnvelopeId: 'env-completed-123' },
      include: expect.any(Object),
    });
    expect(mockDownloadSignedDocument).toHaveBeenCalledWith('env-completed-123');
    expect(mockUploadBuffer).toHaveBeenCalled();
    const uploadCall = mockUploadBuffer.mock.calls[0];
    expect(uploadCall[0]).toBe('partnerships/partnership-uuid/agreement.pdf');
    expect(Buffer.isBuffer(uploadCall[1]) || (uploadCall[1]?.type === 'Buffer')).toBe(true);
    expect(mockPartnershipUpdate).toHaveBeenCalledWith({
      where: { id: 'partnership-uuid' },
      data: {
        documentUrl: 'https://cdn.example.com/partnerships/partnership-uuid/agreement.pdf',
        status: 'fully_executed',
      },
    });
    expect(mockSendPushNotification).toHaveBeenCalledTimes(2);
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'init-user-id',
        title: 'Co-Op agreement signed',
        body: 'Your Co-Op agreement has been signed',
      })
    );
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'partner-user-id',
        title: 'Co-Op agreement signed',
      })
    );
  });

  it('200 — envelope-declined: updates partnership status to draft', async () => {
    mockVerifyDocuSignHmac.mockReturnValue(true);
    const payload = { envelopeId: 'env-declined-456', event: 'envelope-declined' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeDocuSignHmac(Buffer.from(bodyStr, 'utf8'), DOCUSIGN_HMAC_KEY);

    mockPartnershipFindFirst.mockResolvedValue({
      id: 'partnership-declined-uuid',
      docusignEnvelopeId: 'env-declined-456',
    });

    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('X-DocuSign-Signature-1', sig)
      .set('Content-Type', 'application/json')
      .send(bodyStr);

    expect(res.status).toBe(200);
    expect(mockPartnershipUpdate).toHaveBeenCalledWith({
      where: { id: 'partnership-declined-uuid' },
      data: { status: 'draft' },
    });
    expect(mockDownloadSignedDocument).not.toHaveBeenCalled();
  });

  it('200 — envelope-voided: updates partnership status to draft', async () => {
    mockVerifyDocuSignHmac.mockReturnValue(true);
    const payload = { envelopeId: 'env-voided-789', status: 'voided' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeDocuSignHmac(Buffer.from(bodyStr, 'utf8'), DOCUSIGN_HMAC_KEY);

    mockPartnershipFindFirst.mockResolvedValue({
      id: 'partnership-voided-uuid',
      docusignEnvelopeId: 'env-voided-789',
    });

    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('X-DocuSign-Signature-1', sig)
      .set('Content-Type', 'application/json')
      .send(bodyStr);

    expect(res.status).toBe(200);
    expect(mockPartnershipUpdate).toHaveBeenCalledWith({
      where: { id: 'partnership-voided-uuid' },
      data: { status: 'draft' },
    });
  });

  it('200 — unknown event or no envelopeId returns 200', async () => {
    mockVerifyDocuSignHmac.mockReturnValue(true);
    const payload = { envelopeId: 'env-unknown', event: 'envelope-sent' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeDocuSignHmac(Buffer.from(bodyStr, 'utf8'), DOCUSIGN_HMAC_KEY);
    mockPartnershipFindFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('X-DocuSign-Signature-1', sig)
      .set('Content-Type', 'application/json')
      .send(bodyStr);

    expect(res.status).toBe(200);
    expect(mockPartnershipUpdate).not.toHaveBeenCalled();
  });

  it('200 — envelope-completed with no partnership found returns 200', async () => {
    mockVerifyDocuSignHmac.mockReturnValue(true);
    const payload = { envelopeId: 'env-orphan', status: 'completed' };
    const bodyStr = JSON.stringify(payload);
    const sig = computeDocuSignHmac(Buffer.from(bodyStr, 'utf8'), DOCUSIGN_HMAC_KEY);
    mockPartnershipFindFirst.mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/api/v1/webhooks/docusign')
      .set('X-DocuSign-Signature-1', sig)
      .set('Content-Type', 'application/json')
      .send(bodyStr);

    expect(res.status).toBe(200);
    expect(mockDownloadSignedDocument).not.toHaveBeenCalled();
  });
});
