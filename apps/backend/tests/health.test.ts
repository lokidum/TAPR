import request from 'supertest';
import app from '../src/app';

describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.environment).toBeDefined();
    expect(res.body.data.timestamp).toBeDefined();
  });

  it('returns ISO 8601 timestamp', async () => {
    const res = await request(app).get('/api/v1/health');
    const ts = new Date(res.body.data.timestamp as string);
    expect(ts.toISOString()).toBe(res.body.data.timestamp);
  });
});
