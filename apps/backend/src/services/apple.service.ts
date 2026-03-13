import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');
const APPLE_ISSUER = 'https://appleid.apple.com';

// jose caches keys internally; keep one JWKS instance per process
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getAppleJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) jwks = createRemoteJWKSet(APPLE_JWKS_URL);
  return jwks;
}

export interface AppleTokenClaims {
  sub: string;
  email?: string;
}

export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<AppleTokenClaims> {
  const { payload } = await jwtVerify(identityToken, getAppleJWKS(), {
    issuer: APPLE_ISSUER,
  });

  if (!payload.sub) throw new Error('Apple token missing sub claim');

  return {
    sub: payload.sub,
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
  };
}
