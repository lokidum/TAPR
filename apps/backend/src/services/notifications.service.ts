import * as admin from 'firebase-admin';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.service';
import logger from '../utils/logger';

const INVALID_TOKEN_ERROR_CODES = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
];

let _firebaseApp: admin.app.App | null = null;

function getFirebaseApp(): admin.app.App {
  if (!_firebaseApp) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!json) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is required');
    }
    const credential = JSON.parse(json) as admin.ServiceAccount;
    _firebaseApp = admin.initializeApp({ credential: admin.credential.cert(credential) });
  }
  return _firebaseApp;
}

export interface SendPushNotificationParams {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  type: string;
}

export async function sendPushNotification(params: SendPushNotificationParams): Promise<void> {
  const { userId, title, body, data, type } = params;

  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) {
    logger.info('No push tokens for user, skipping FCM', { userId });
  } else {
    try {
      const app = getFirebaseApp();
      const messaging = admin.messaging(app);

      const message: admin.messaging.MulticastMessage = {
        notification: { title, body },
        data: data ? { ...data, type } : { type },
        tokens: tokens.map((t) => t.token),
      };

      const response = await messaging.sendEachForMulticast(message);

      for (let i = 0; i < response.responses.length; i++) {
        const r = response.responses[i];
        const tokenRecord = tokens[i];
        if (!r.success && r.error?.code && INVALID_TOKEN_ERROR_CODES.includes(r.error.code)) {
          await prisma.deviceToken.delete({ where: { id: tokenRecord.id } });
          logger.info('Removed invalid FCM token', {
            userId,
            tokenId: tokenRecord.id,
            errorCode: r.error.code,
          });
        }
      }
    } catch (err) {
      logger.error('FCM send failed', { userId, err });
      // Don't throw — we still save the notification
    }
  }

  const dataJson = data ? (data as Prisma.InputJsonValue) : undefined;
  await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: dataJson,
      sentVia: tokens.length > 0 ? ['push'] : [],
    },
  });
}
