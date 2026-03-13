import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRole } from '../types/api';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  level?: number;
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): jwt.JwtPayload & AccessTokenPayload {
  const decoded = jwt.verify(token, getAccessSecret());
  if (typeof decoded === 'string') {
    throw new Error('Unexpected string payload');
  }
  return decoded as jwt.JwtPayload & AccessTokenPayload;
}

export function signRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}
