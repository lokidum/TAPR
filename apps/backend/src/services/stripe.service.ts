import Stripe from 'stripe';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// ── Connect accounts ──────────────────────────────────────────────────────────

export async function createConnectAccount(country = 'AU'): Promise<Stripe.Account> {
  return getStripe().accounts.create({
    type: 'express',
    country,
    capabilities: {
      transfers: { requested: true },
    },
  });
}

export async function createConnectOnboardingUrl(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });
  return link.url;
}

// ── Payment intents ───────────────────────────────────────────────────────────

export interface CreatePaymentIntentParams {
  amountCents: number;
  currency?: string;
  customerId?: string;
  barberStripeAccountId: string;
  platformFeeCents: number;
  metadata: Record<string, string>;
}

export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const {
    amountCents,
    currency = 'aud',
    customerId,
    barberStripeAccountId,
    platformFeeCents,
    metadata,
  } = params;

  return getStripe().paymentIntents.create({
    amount: amountCents,
    currency,
    capture_method: 'manual',
    ...(customerId ? { customer: customerId } : {}),
    transfer_data: { destination: barberStripeAccountId },
    application_fee_amount: platformFeeCents,
    metadata,
  });
}

export interface CreateChairRentalPaymentIntentParams {
  amountCents: number;
  studioStripeAccountId: string;
  metadata: Record<string, string>;
}

export async function createChairRentalPaymentIntent(
  params: CreateChairRentalPaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const { amountCents, studioStripeAccountId, metadata } = params;
  return getStripe().paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    capture_method: 'manual',
    transfer_data: { destination: studioStripeAccountId },
    metadata,
  });
}

export async function createAndConfirmPlatformPayment(
  amountCents: number,
  paymentMethodId: string,
  metadata: Record<string, string>
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.create({
    amount: amountCents,
    currency: 'aud',
    capture_method: 'automatic',
    payment_method: paymentMethodId,
    confirm: true,
    metadata,
  });
}

export async function capturePaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.capture(paymentIntentId);
}

export async function refundPaymentIntent(
  paymentIntentId: string,
  amountCents?: number
): Promise<Stripe.Refund> {
  return getStripe().refunds.create({
    payment_intent: paymentIntentId,
    ...(amountCents !== undefined ? { amount: amountCents } : {}),
  });
}

export async function cancelPaymentIntent(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.cancel(paymentIntentId);
}

// ── Transfers (studio payouts) ────────────────────────────────────────────────

export async function createTransfer(
  amountCents: number,
  destinationAccountId: string,
  metadata: Record<string, string>
): Promise<Stripe.Transfer> {
  return getStripe().transfers.create({
    amount: amountCents,
    currency: 'aud',
    destination: destinationAccountId,
    metadata,
  });
}

// ── Charges (for dispute resolution) ───────────────────────────────────────────

export async function retrieveCharge(chargeId: string): Promise<Stripe.Charge> {
  return getStripe().charges.retrieve(chargeId, { expand: ['payment_intent'] });
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}
