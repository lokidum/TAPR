import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { prisma } from '../services/prisma.service';
import {
  constructWebhookEvent,
  retrieveCharge,
} from '../services/stripe.service';
import {
  isStripeEventProcessed,
  setStripeEventProcessed,
} from '../services/redis.service';
import { enqueueNotification } from '../services/queue.service';
import { successResponse, errorResponse } from '../types/api';
import logger from '../utils/logger';

const router = Router();

// ── POST /webhooks/stripe ─────────────────────────────────────────────────────
// Uses express.raw() — must be mounted with raw body parser, not express.json()

router.post(
  '/stripe',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const sig = req.headers['stripe-signature'] as string | undefined;
    if (!sig) {
      res.status(400).json(errorResponse('BAD_REQUEST', 'Missing stripe-signature header'));
      return;
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      res.status(400).json(errorResponse('BAD_REQUEST', 'Invalid webhook body (expected raw buffer)'));
      return;
    }

    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(rawBody, sig);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(400).json(errorResponse('BAD_REQUEST', 'Webhook signature verification failed'));
      return;
    }

    try {
      const eventId = event.id;

      if (await isStripeEventProcessed(eventId)) {
        res.status(200).json(successResponse({ received: true, duplicate: true }));
        return;
      }

      await setStripeEventProcessed(eventId);

      switch (event.type) {
        case 'account.updated':
          await handleAccountUpdated(event);
          break;
        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(event);
          break;
        case 'payment_intent.requires_action':
          await handlePaymentIntentRequiresAction(event);
          break;
        case 'charge.dispute.created':
          await handleDisputeCreated(event);
          break;
        default:
          break;
      }

      res.status(200).json(successResponse({ received: true }));
    } catch (err) {
      next(err);
    }
  }
);

async function handleAccountUpdated(event: Stripe.Event): Promise<void> {
  const account = event.data.object as Stripe.Account;
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const isVerified = chargesEnabled && payoutsEnabled;

  const [studio] = await prisma.studioProfile.findMany({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (studio) {
    await prisma.studioProfile.update({
      where: { id: studio.id },
      data: { isVerified },
    });
    logger.info('Studio Stripe account updated', {
      studioId: studio.id,
      accountId: account.id,
      isVerified,
    });
  }

  const [barber] = await prisma.barberProfile.findMany({
    where: { stripeAccountId: account.id },
    select: { id: true },
  });
  if (barber) {
    logger.info('Barber Stripe account updated', {
      barberId: barber.id,
      accountId: account.id,
      chargesEnabled,
      payoutsEnabled,
    });
  }
}

async function handlePaymentIntentFailed(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  const failureReason = pi.last_payment_error?.message ?? 'Unknown';

  const booking = await prisma.booking.findFirst({
    where: { stripePaymentIntentId: pi.id },
  });
  if (booking) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'cancelled' },
    });
    logger.info('Booking cancelled due to payment failure', {
      bookingId: booking.id,
      paymentIntentId: pi.id,
      reason: failureReason,
    });
  }
}

async function handlePaymentIntentRequiresAction(event: Stripe.Event): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;
  logger.info('PaymentIntent requires action (3DS challenge)', {
    paymentIntentId: pi.id,
    status: pi.status,
  });
}

async function handleDisputeCreated(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    logger.warn('Dispute has no charge', { disputeId: dispute.id });
    return;
  }

  const charge = await retrieveCharge(chargeId);
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) {
    logger.warn('Charge has no payment_intent', { chargeId });
    return;
  }

  const booking = await prisma.booking.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { consumer: true, barber: { include: { user: true } } },
  });
  if (!booking) {
    logger.warn('No booking found for disputed payment', { paymentIntentId });
    return;
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'disputed' },
    }),
    prisma.dispute.create({
      data: {
        bookingId: booking.id,
        raisedById: booking.consumerId,
        againstId: booking.barber.userId,
        reason: dispute.reason ?? 'dispute',
        evidenceUrls: [],
      },
    }),
  ]);

  await enqueueNotification({
    userId: booking.consumerId,
    type: 'dispute_created',
    title: 'Payment dispute opened',
    body: 'A dispute has been opened for your booking. Our team will review it.',
    data: { bookingId: booking.id },
  });
  await enqueueNotification({
    userId: booking.barber.userId,
    type: 'dispute_created',
    title: 'Payment dispute opened',
    body: 'A dispute has been opened for a booking. Our team will review it.',
    data: { bookingId: booking.id },
  });

  logger.info('Dispute created and notifications enqueued', {
    bookingId: booking.id,
    disputeId: dispute.id,
    reason: dispute.reason,
  });
}

export default router;
