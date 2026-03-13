jest.mock('ioredis', () => require('ioredis-mock'));

import {
  setRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens,
  setOTP,
  getOTP,
  deleteOTP,
  incrementRateLimit,
  getRedisClient,
} from '../src/services/redis.service';

afterEach(async () => {
  await getRedisClient().flushall();
});

// ── Refresh tokens ────────────────────────────────────────────────────────────

describe('setRefreshToken / getRefreshToken', () => {
  it('stores a token and retrieves the userId', async () => {
    await setRefreshToken('token-abc', 'user-1', 300);
    const result = await getRefreshToken('token-abc');
    expect(result).toBe('user-1');
  });

  it('returns null for an unknown token', async () => {
    const result = await getRefreshToken('nonexistent');
    expect(result).toBeNull();
  });

  it('adds the token to the user set', async () => {
    await setRefreshToken('token-abc', 'user-1', 300);
    const members = await getRedisClient().smembers('user_tokens:user-1');
    expect(members).toContain('token-abc');
  });

  it('accumulates multiple tokens in the user set', async () => {
    await setRefreshToken('token-1', 'user-1', 300);
    await setRefreshToken('token-2', 'user-1', 300);
    const members = await getRedisClient().smembers('user_tokens:user-1');
    expect(members).toContain('token-1');
    expect(members).toContain('token-2');
  });
});

describe('deleteRefreshToken', () => {
  it('removes the token key', async () => {
    await setRefreshToken('token-abc', 'user-1', 300);
    await deleteRefreshToken('token-abc');
    const result = await getRefreshToken('token-abc');
    expect(result).toBeNull();
  });

  it('removes the token from the user set', async () => {
    await setRefreshToken('token-abc', 'user-1', 300);
    await deleteRefreshToken('token-abc');
    const members = await getRedisClient().smembers('user_tokens:user-1');
    expect(members).not.toContain('token-abc');
  });

  it('does not throw when deleting a non-existent token', async () => {
    await expect(deleteRefreshToken('ghost-token')).resolves.toBeUndefined();
  });
});

describe('deleteAllUserTokens', () => {
  it('deletes all refresh token keys for the user', async () => {
    await setRefreshToken('token-1', 'user-1', 300);
    await setRefreshToken('token-2', 'user-1', 300);
    await deleteAllUserTokens('user-1');
    expect(await getRefreshToken('token-1')).toBeNull();
    expect(await getRefreshToken('token-2')).toBeNull();
  });

  it('removes the user token set', async () => {
    await setRefreshToken('token-1', 'user-1', 300);
    await deleteAllUserTokens('user-1');
    const members = await getRedisClient().smembers('user_tokens:user-1');
    expect(members).toHaveLength(0);
  });

  it('does not affect tokens belonging to other users', async () => {
    await setRefreshToken('token-a', 'user-1', 300);
    await setRefreshToken('token-b', 'user-2', 300);
    await deleteAllUserTokens('user-1');
    expect(await getRefreshToken('token-b')).toBe('user-2');
  });

  it('does nothing when the user has no tokens', async () => {
    await expect(deleteAllUserTokens('user-nobody')).resolves.toBeUndefined();
  });
});

// ── OTP ───────────────────────────────────────────────────────────────────────

describe('setOTP / getOTP', () => {
  it('stores a hashed OTP and retrieves it', async () => {
    await setOTP('+61400000001', 'hashed-otp-value', 300);
    const result = await getOTP('+61400000001');
    expect(result).toBe('hashed-otp-value');
  });

  it('returns null for an unknown phone', async () => {
    const result = await getOTP('+61400000099');
    expect(result).toBeNull();
  });
});

describe('deleteOTP', () => {
  it('removes the OTP', async () => {
    await setOTP('+61400000001', 'hashed-otp-value', 300);
    await deleteOTP('+61400000001');
    const result = await getOTP('+61400000001');
    expect(result).toBeNull();
  });

  it('does not throw when deleting a non-existent OTP', async () => {
    await expect(deleteOTP('+61400000099')).resolves.toBeUndefined();
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('incrementRateLimit', () => {
  it('returns 1 on first call', async () => {
    const count = await incrementRateLimit('rate:ip:1.2.3.4', 60);
    expect(count).toBe(1);
  });

  it('increments on subsequent calls', async () => {
    await incrementRateLimit('rate:ip:1.2.3.4', 60);
    await incrementRateLimit('rate:ip:1.2.3.4', 60);
    const count = await incrementRateLimit('rate:ip:1.2.3.4', 60);
    expect(count).toBe(3);
  });

  it('uses separate counters per key', async () => {
    await incrementRateLimit('rate:ip:1.2.3.4', 60);
    await incrementRateLimit('rate:ip:1.2.3.4', 60);
    const otherCount = await incrementRateLimit('rate:ip:9.9.9.9', 60);
    expect(otherCount).toBe(1);
  });
});
