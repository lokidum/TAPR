import twilio from 'twilio';
import logger from '../utils/logger';

export async function sendSMS(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    logger.warn('Twilio not configured — SMS skipped', { to });
    return;
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({ to, from, body });
}
