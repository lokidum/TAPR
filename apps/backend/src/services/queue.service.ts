import { Queue } from 'bullmq';

export function getQueueConnection(): { host: string; port: number } {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
  };
}

let _bookingQueue: Queue | null = null;

export function getBookingQueue(): Queue {
  if (!_bookingQueue) {
    _bookingQueue = new Queue('bookings', {
      connection: getQueueConnection(),
      defaultJobOptions: { removeOnComplete: 100 },
    });
  }
  return _bookingQueue;
}

export interface BookingReminderJobPayload {
  bookingId: string;
  consumerId: string;
  barberId: string;
}

export interface ReviewRequestJobPayload {
  bookingId: string;
  consumerId: string;
  barberId: string;
}

export async function enqueueBookingReminder(
  payload: BookingReminderJobPayload,
  delayMs: number
): Promise<void> {
  await getBookingQueue().add('booking_reminder_job', payload, { delay: delayMs });
}

export async function enqueueReviewRequest(
  payload: ReviewRequestJobPayload,
  delayMs: number
): Promise<void> {
  await getBookingQueue().add('review_request_job', payload, { delay: delayMs });
}

export interface NotificationJobPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function enqueueNotification(payload: NotificationJobPayload): Promise<void> {
  await getBookingQueue().add('notification_job', payload);
}

export interface EscrowReleaseJobPayload {
  rentalId: string;
  paymentIntentId: string;
  studioStripeAccountId: string;
}

const ESCROW_JOB_PREFIX = 'escrow_release:';

export async function enqueueEscrowReleaseJob(
  payload: EscrowReleaseJobPayload,
  delayMs: number
): Promise<string> {
  const job = await getBookingQueue().add('escrow_release_job', payload, {
    delay: delayMs,
    jobId: `${ESCROW_JOB_PREFIX}${payload.rentalId}`,
  });
  return job.id ?? job.name ?? payload.rentalId;
}

export async function cancelEscrowReleaseJob(rentalId: string): Promise<boolean> {
  const queue = getBookingQueue();
  const jobId = `${ESCROW_JOB_PREFIX}${rentalId}`;
  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
  } catch {
    // Job may not exist (already completed or never added)
  }
  return false;
}
