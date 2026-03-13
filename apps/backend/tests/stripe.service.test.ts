// ── Mock Stripe SDK ───────────────────────────────────────────────────────────
// Variables prefixed with "mock" are accessible inside jest.mock factories
// even after hoisting — this is a deliberate Jest exception to the normal rule.

const mockAccountLinksCreate = jest.fn();
const mockAccountsCreate = jest.fn();
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsCapture = jest.fn();
const mockPaymentIntentsCancel = jest.fn();
const mockRefundsCreate = jest.fn();
const mockTransfersCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    accountLinks: { create: mockAccountLinksCreate },
    accounts: { create: mockAccountsCreate },
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      capture: mockPaymentIntentsCapture,
      cancel: mockPaymentIntentsCancel,
    },
    refunds: { create: mockRefundsCreate },
    transfers: { create: mockTransfersCreate },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }))
);

import Stripe from 'stripe';
import {
  createConnectAccount,
  createConnectOnboardingUrl,
  createPaymentIntent,
  capturePaymentIntent,
  cancelPaymentIntent,
  refundPaymentIntent,
  createTransfer,
  constructWebhookEvent,
} from '../src/services/stripe.service';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_secret';
});

afterAll(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ── createConnectAccount ──────────────────────────────────────────────────────

describe('createConnectAccount', () => {
  const ACCOUNT: Partial<Stripe.Account> = {
    id: 'acct_test123',
    type: 'express',
    country: 'AU',
  };

  beforeEach(() => {
    mockAccountsCreate.mockResolvedValue(ACCOUNT);
  });

  it('creates an express account with transfers capability', async () => {
    await createConnectAccount();

    expect(mockAccountsCreate).toHaveBeenCalledWith({
      type: 'express',
      country: 'AU',
      capabilities: { transfers: { requested: true } },
    });
  });

  it('defaults country to AU', async () => {
    await createConnectAccount();

    expect(mockAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'AU' })
    );
  });

  it('accepts a custom country', async () => {
    await createConnectAccount('US');

    expect(mockAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'US' })
    );
  });

  it('returns the account object from Stripe', async () => {
    const result = await createConnectAccount();
    expect(result).toBe(ACCOUNT);
  });
});

// ── createConnectOnboardingUrl ────────────────────────────────────────────────

describe('createConnectOnboardingUrl', () => {
  const LINK_URL = 'https://connect.stripe.com/setup/e/acct_test123/abc123';

  beforeEach(() => {
    mockAccountLinksCreate.mockResolvedValue({ url: LINK_URL, expires_at: 9999999999 });
  });

  it('calls accountLinks.create with correct params', async () => {
    await createConnectOnboardingUrl('acct_test123', 'https://app.com/return', 'https://app.com/refresh');

    expect(mockAccountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_test123',
      return_url: 'https://app.com/return',
      refresh_url: 'https://app.com/refresh',
      type: 'account_onboarding',
    });
  });

  it('returns the url string from the account link', async () => {
    const url = await createConnectOnboardingUrl('acct_test123', 'https://app.com/return', 'https://app.com/refresh');
    expect(url).toBe(LINK_URL);
  });
});

// ── createPaymentIntent ───────────────────────────────────────────────────────

describe('createPaymentIntent', () => {
  const PAYMENT_INTENT: Partial<Stripe.PaymentIntent> = {
    id: 'pi_test123',
    status: 'requires_capture',
    amount: 5000,
    currency: 'aud',
  };

  beforeEach(() => {
    mockPaymentIntentsCreate.mockResolvedValue(PAYMENT_INTENT);
  });

  const BASE_PARAMS = {
    amountCents: 5000,
    barberStripeAccountId: 'acct_barber123',
    platformFeeCents: 250,
    metadata: { bookingId: 'booking-uuid' },
  };

  it('creates with capture_method: manual', async () => {
    await createPaymentIntent(BASE_PARAMS);

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ capture_method: 'manual' })
    );
  });

  it('sets transfer_data.destination to the barber account', async () => {
    await createPaymentIntent(BASE_PARAMS);

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        transfer_data: { destination: 'acct_barber123' },
      })
    );
  });

  it('sets application_fee_amount to platformFeeCents', async () => {
    await createPaymentIntent(BASE_PARAMS);

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ application_fee_amount: 250 })
    );
  });

  it('defaults currency to aud', async () => {
    await createPaymentIntent(BASE_PARAMS);

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'aud' })
    );
  });

  it('accepts a custom currency', async () => {
    await createPaymentIntent({ ...BASE_PARAMS, currency: 'usd' });

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'usd' })
    );
  });

  it('includes customer when customerId is provided', async () => {
    await createPaymentIntent({ ...BASE_PARAMS, customerId: 'cus_test123' });

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_test123' })
    );
  });

  it('omits customer field when customerId is not provided', async () => {
    await createPaymentIntent(BASE_PARAMS);

    const call = mockPaymentIntentsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('customer');
  });

  it('passes metadata to the intent', async () => {
    await createPaymentIntent(BASE_PARAMS);

    expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { bookingId: 'booking-uuid' } })
    );
  });

  it('returns the PaymentIntent from Stripe', async () => {
    const result = await createPaymentIntent(BASE_PARAMS);
    expect(result).toBe(PAYMENT_INTENT);
  });
});

// ── capturePaymentIntent ──────────────────────────────────────────────────────

describe('capturePaymentIntent', () => {
  const CAPTURED: Partial<Stripe.PaymentIntent> = { id: 'pi_test123', status: 'succeeded' };

  beforeEach(() => {
    mockPaymentIntentsCapture.mockResolvedValue(CAPTURED);
  });

  it('calls paymentIntents.capture with the intent ID', async () => {
    await capturePaymentIntent('pi_test123');
    expect(mockPaymentIntentsCapture).toHaveBeenCalledWith('pi_test123');
  });

  it('returns the captured PaymentIntent', async () => {
    const result = await capturePaymentIntent('pi_test123');
    expect(result).toBe(CAPTURED);
  });
});

// ── cancelPaymentIntent ───────────────────────────────────────────────────────

describe('cancelPaymentIntent', () => {
  const CANCELLED: Partial<Stripe.PaymentIntent> = { id: 'pi_test123', status: 'canceled' };

  beforeEach(() => {
    mockPaymentIntentsCancel.mockResolvedValue(CANCELLED);
  });

  it('calls paymentIntents.cancel with the intent ID', async () => {
    await cancelPaymentIntent('pi_test123');
    expect(mockPaymentIntentsCancel).toHaveBeenCalledWith('pi_test123');
  });

  it('returns the cancelled PaymentIntent', async () => {
    const result = await cancelPaymentIntent('pi_test123');
    expect(result).toBe(CANCELLED);
  });
});

// ── refundPaymentIntent ───────────────────────────────────────────────────────

describe('refundPaymentIntent', () => {
  const REFUND: Partial<Stripe.Refund> = { id: 'ref_test123', status: 'succeeded' };

  beforeEach(() => {
    mockRefundsCreate.mockResolvedValue(REFUND);
  });

  it('creates a full refund when no amount is specified', async () => {
    await refundPaymentIntent('pi_test123');

    expect(mockRefundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_test123' });
    const call = mockRefundsCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('amount');
  });

  it('creates a partial refund when amountCents is provided', async () => {
    await refundPaymentIntent('pi_test123', 2500);

    expect(mockRefundsCreate).toHaveBeenCalledWith({
      payment_intent: 'pi_test123',
      amount: 2500,
    });
  });

  it('returns the Refund object', async () => {
    const result = await refundPaymentIntent('pi_test123');
    expect(result).toBe(REFUND);
  });
});

// ── createTransfer ────────────────────────────────────────────────────────────

describe('createTransfer', () => {
  const TRANSFER: Partial<Stripe.Transfer> = { id: 'tr_test123', amount: 4000 };

  beforeEach(() => {
    mockTransfersCreate.mockResolvedValue(TRANSFER);
  });

  it('calls transfers.create with correct params', async () => {
    await createTransfer(4000, 'acct_studio123', { bookingId: 'b-uuid' });

    expect(mockTransfersCreate).toHaveBeenCalledWith({
      amount: 4000,
      currency: 'aud',
      destination: 'acct_studio123',
      metadata: { bookingId: 'b-uuid' },
    });
  });

  it('always uses aud as currency', async () => {
    await createTransfer(4000, 'acct_studio123', {});

    expect(mockTransfersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'aud' })
    );
  });

  it('returns the Transfer object', async () => {
    const result = await createTransfer(4000, 'acct_studio123', {});
    expect(result).toBe(TRANSFER);
  });
});

// ── constructWebhookEvent ─────────────────────────────────────────────────────

describe('constructWebhookEvent', () => {
  const FAKE_EVENT = { id: 'evt_test123', type: 'payment_intent.succeeded' } as Stripe.Event;
  const PAYLOAD = Buffer.from('{"type":"payment_intent.succeeded"}');
  const SIG = 't=12345,v1=abcdef';

  beforeEach(() => {
    mockWebhooksConstructEvent.mockReturnValue(FAKE_EVENT);
  });

  it('calls webhooks.constructEvent with payload, signature, and STRIPE_WEBHOOK_SECRET', () => {
    constructWebhookEvent(PAYLOAD, SIG);

    expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
      PAYLOAD,
      SIG,
      'whsec_fake_secret'
    );
  });

  it('returns the parsed Stripe event', () => {
    const event = constructWebhookEvent(PAYLOAD, SIG);
    expect(event).toBe(FAKE_EVENT);
  });

  it('throws when STRIPE_WEBHOOK_SECRET is not configured', () => {
    const original = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    expect(() => constructWebhookEvent(PAYLOAD, SIG)).toThrow(
      'STRIPE_WEBHOOK_SECRET is not configured'
    );

    process.env.STRIPE_WEBHOOK_SECRET = original;
  });

  it('propagates Stripe signature verification errors', () => {
    const sigError = new Error('No signatures found matching the expected signature for payload');
    mockWebhooksConstructEvent.mockImplementation(() => { throw sigError; });

    expect(() => constructWebhookEvent(PAYLOAD, SIG)).toThrow(sigError);
  });
});

// ── Singleton / initialization ────────────────────────────────────────────────

describe('Stripe singleton initialization', () => {
  it('throws when STRIPE_SECRET_KEY is missing', async () => {
    // Reset singleton state by re-requiring with a fresh module scope
    jest.resetModules();
    delete process.env.STRIPE_SECRET_KEY;

    const { createConnectAccount: freshCreateAccount } =
      await import('../src/services/stripe.service');

    await expect(freshCreateAccount()).rejects.toThrow('STRIPE_SECRET_KEY is not configured');

    // Restore for remaining suites
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
  });
});
