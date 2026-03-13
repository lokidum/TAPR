export interface GoogleTokenClaims {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenClaims> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    throw new InvalidGoogleTokenError('Google rejected the ID token');
  }

  const data = (await response.json()) as Record<string, string>;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (clientId && data['aud'] !== clientId) {
    throw new InvalidGoogleTokenError('Google token audience does not match GOOGLE_CLIENT_ID');
  }

  return {
    sub: data['sub'],
    email: data['email'],
    name: data['name'],
    picture: data['picture'],
  };
}

export class InvalidGoogleTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGoogleTokenError';
  }
}
