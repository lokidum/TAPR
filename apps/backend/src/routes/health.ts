import { Router, Request, Response } from 'express';
import { successResponse } from '../types/api';

const router = Router();

router.get('/', (_req: Request, res: Response): void => {
  res.status(200).json(
    successResponse({
      status: 'ok',
      version: process.env.npm_package_version ?? '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    })
  );
});

export default router;
