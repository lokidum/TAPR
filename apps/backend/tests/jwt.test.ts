import jwt from 'jsonwebtoken';
import { signAccessToken, signRefreshToken, verifyAccessToken } from '../src/utils/jwt';

const SECRET = 'test-secret-at-least-32-characters-long';

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

describe('signAccessToken', () => {
  it('returns a valid JWT string', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'consumer' });
    expect(typeof token).toBe('string');
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded.sub).toBe('user-1');
    expect(decoded['role']).toBe('consumer');
  });

  it('includes level when provided', () => {
    const token = signAccessToken({ sub: 'barber-1', role: 'barber', level: 3 });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded['level']).toBe(3);
  });

  it('expires in 15 minutes', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signAccessToken({ sub: 'user-1', role: 'consumer' });
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(decoded.exp).toBeGreaterThan(before + 14 * 60);
    expect(decoded.exp).toBeLessThanOrEqual(before + 15 * 60 + 1);
  });

  it('throws if JWT_ACCESS_SECRET is not set', () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(() => signAccessToken({ sub: 'user-1', role: 'consumer' })).toThrow(
      'JWT_ACCESS_SECRET is not set'
    );
  });
});

describe('verifyAccessToken', () => {
  it('verifies and returns the payload', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'studio' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('studio');
  });

  it('throws TokenExpiredError for an expired token', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'consumer' }, SECRET, { expiresIn: -1 });
    expect(() => verifyAccessToken(token)).toThrow(jwt.TokenExpiredError);
  });

  it('throws JsonWebTokenError for a tampered token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'consumer' });
    expect(() => verifyAccessToken(token + 'tampered')).toThrow(jwt.JsonWebTokenError);
  });

  it('throws JsonWebTokenError for wrong secret', () => {
    const token = jwt.sign({ sub: 'user-1', role: 'consumer' }, 'wrong-secret');
    expect(() => verifyAccessToken(token)).toThrow(jwt.JsonWebTokenError);
  });
});

describe('signRefreshToken', () => {
  it('returns a 128-character hex string', () => {
    const token = signRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{128}$/);
  });

  it('returns a unique token on each call', () => {
    const a = signRefreshToken();
    const b = signRefreshToken();
    expect(a).not.toBe(b);
  });
});
