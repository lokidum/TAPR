export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

export function successResponse<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { success: true, data, ...(meta ? { meta } : {}) };
}

export function errorResponse(code: string, message: string, details?: unknown): ApiError {
  return {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  };
}

export type UserRole = 'consumer' | 'barber' | 'studio' | 'admin';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  level?: number;
  iat: number;
  exp: number;
}
