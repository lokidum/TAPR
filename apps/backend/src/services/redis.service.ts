import Redis from 'ioredis';
import logger from '../utils/logger';

const REFRESH_PREFIX = 'refresh:';
const USER_TOKENS_PREFIX = 'user_tokens:';
const OTP_PREFIX = 'otp:';

let _client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_client) {
    _client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    _client.on('error', (err: Error) => {
      logger.error('Redis connection error', { error: err.message });
    });
  }
  return _client;
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export async function setRefreshToken(
  token: string,
  userId: string,
  ttlSeconds: number
): Promise<void> {
  const client = getRedisClient();
  const pipeline = client.pipeline();
  pipeline.setex(`${REFRESH_PREFIX}${token}`, ttlSeconds, userId);
  pipeline.sadd(`${USER_TOKENS_PREFIX}${userId}`, token);
  // Keep the user token set alive at least as long as the newest token
  pipeline.expire(`${USER_TOKENS_PREFIX}${userId}`, ttlSeconds);
  await pipeline.exec();
}

export async function getRefreshToken(token: string): Promise<string | null> {
  return getRedisClient().get(`${REFRESH_PREFIX}${token}`);
}

export async function deleteRefreshToken(token: string): Promise<void> {
  // Retrieve userId before deleting so we can clean the user set
  const userId = await getRedisClient().get(`${REFRESH_PREFIX}${token}`);
  const pipeline = getRedisClient().pipeline();
  pipeline.del(`${REFRESH_PREFIX}${token}`);
  if (userId) {
    pipeline.srem(`${USER_TOKENS_PREFIX}${userId}`, token);
  }
  await pipeline.exec();
}

export async function deleteAllUserTokens(userId: string): Promise<void> {
  const client = getRedisClient();
  const tokens = await client.smembers(`${USER_TOKENS_PREFIX}${userId}`);

  if (tokens.length === 0) return;

  const pipeline = client.pipeline();
  for (const token of tokens) {
    pipeline.del(`${REFRESH_PREFIX}${token}`);
  }
  pipeline.del(`${USER_TOKENS_PREFIX}${userId}`);
  await pipeline.exec();
}

// ── OTP ───────────────────────────────────────────────────────────────────────

export async function setOTP(
  phone: string,
  hashedOTP: string,
  ttlSeconds: number
): Promise<void> {
  await getRedisClient().setex(`${OTP_PREFIX}${phone}`, ttlSeconds, hashedOTP);
}

export async function getOTP(phone: string): Promise<string | null> {
  return getRedisClient().get(`${OTP_PREFIX}${phone}`);
}

export async function deleteOTP(phone: string): Promise<void> {
  await getRedisClient().del(`${OTP_PREFIX}${phone}`);
}

// ── Pub/sub ───────────────────────────────────────────────────────────────────

export async function publishToChannel(channel: string, message: string): Promise<void> {
  await getRedisClient().publish(channel, message);
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

export async function incrementRateLimit(
  key: string,
  windowSeconds: number
): Promise<number> {
  const client = getRedisClient();
  const count = await client.incr(key);
  if (count === 1) {
    // First request in this window — set the expiry
    await client.expire(key, windowSeconds);
  }
  return count;
}
