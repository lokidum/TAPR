import request from 'supertest';
import express, { Router } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate, requireRole } from '../src/middleware/auth.middleware';
import { signAccessToken } from '../src/utils/jwt';

const SECRET = 'test-secret-at-least-32-characters-long';

beforeEach(() => {
  process.env.JWT_ACCESS_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.JWT_ACCESS_SECRET;
});

function buildApp(extraMiddleware?: express.RequestHandler[]): express.Express {
  const app = express();
  const router = Router();

  const handlers: express.RequestHandler[] = [authenticate, ...(extraMiddleware ?? [])];
  router.get('/protected', ...handlers, (_req, res) => {
    res.json({ success: true, data: { user: _req.user } });
  });

  app.use(router);
  return app;
}

describe('authenticate middleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when header is not Bearer scheme', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a tampered token', async () => {
    const token = signAccessToken({ sub: 'user-1', role: 'consumer' });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}tampered`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 403 for an expired token', async () => {
    const token = jwt.sign({ sub: 'user-1', role: 'consumer' }, SECRET, { expiresIn: -1 });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('attaches user to req and calls next for a valid token', async () => {
    const token = signAccessToken({ sub: 'user-abc', role: 'barber', level: 3 });
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.sub).toBe('user-abc');
    expect(res.body.data.user.role).toBe('barber');
    expect(res.body.data.user.level).toBe(3);
  });
});

describe('requireRole middleware', () => {
  it('returns 403 when role does not match', async () => {
    const token = signAccessToken({ sub: 'user-1', role: 'consumer' });
    const app = buildApp([requireRole('barber', 'studio')]);
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('passes when role matches one of the allowed roles', async () => {
    const token = signAccessToken({ sub: 'user-1', role: 'studio' });
    const app = buildApp([requireRole('barber', 'studio')]);
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('passes when role is admin and admin is allowed', async () => {
    const token = signAccessToken({ sub: 'admin-1', role: 'admin' });
    const app = buildApp([requireRole('admin')]);
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
