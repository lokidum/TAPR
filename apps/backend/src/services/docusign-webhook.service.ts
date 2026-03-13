import crypto from 'crypto';

export function verifyDocuSignHmac(rawBody: Buffer, signature: string): boolean {
  const key = process.env.DOCUSIGN_HMAC_KEY;
  if (!key) {
    throw new Error('DOCUSIGN_HMAC_KEY is not configured');
  }
  const computed = crypto
    .createHmac('sha256', key)
    .update(rawBody)
    .digest('base64');
  try {
    const computedBuf = Buffer.from(computed, 'base64');
    const sigBuf = Buffer.from(signature, 'base64');
    if (computedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(computedBuf, sigBuf);
  } catch {
    return false;
  }
}
