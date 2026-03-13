import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';
import { errorResponse } from '../types/api';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid request data', err.flatten()));
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
    return;
  }

  logger.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'));
}
