import crypto from 'crypto';
import { verifyDocuSignHmac } from '../src/services/docusign-webhook.service';

const DOCUSIGN_HMAC_KEY = 'test-hmac-key-32-characters!!';

beforeAll(() => {
  process.env.DOCUSIGN_HMAC_KEY = DOCUSIGN_HMAC_KEY;
});

afterAll(() => {
  delete process.env.DOCUSIGN_HMAC_KEY;
});

describe('verifyDocuSignHmac', () => {
  it('returns true for valid HMAC signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ envelopeId: 'env-123', status: 'completed' }));
    const sig = crypto.createHmac('sha256', DOCUSIGN_HMAC_KEY).update(rawBody).digest('base64');
    expect(verifyDocuSignHmac(rawBody, sig)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ envelopeId: 'env-123' }));
    expect(verifyDocuSignHmac(rawBody, 'invalid-base64')).toBe(false);
  });

  it('returns false when signature does not match body', () => {
    const rawBody = Buffer.from('{"envelopeId":"env-123"}');
    const wrongSig = crypto.createHmac('sha256', DOCUSIGN_HMAC_KEY)
      .update(Buffer.from('different-body'))
      .digest('base64');
    expect(verifyDocuSignHmac(rawBody, wrongSig)).toBe(false);
  });

  it('throws when DOCUSIGN_HMAC_KEY is not configured', () => {
    delete process.env.DOCUSIGN_HMAC_KEY;
    const rawBody = Buffer.from('{}');
    expect(() => verifyDocuSignHmac(rawBody, 'sig')).toThrow('DOCUSIGN_HMAC_KEY is not configured');
    process.env.DOCUSIGN_HMAC_KEY = DOCUSIGN_HMAC_KEY;
  });
});
