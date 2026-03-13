import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import serverless from 'serverless-http';
import { config } from './config';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';
import { unauthenticatedLimiter } from './middleware/rateLimiter';
import logger from './utils/logger';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || config.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  })
);

// Body parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global rate limiter for unauthenticated requests
app.use('/api/v1', unauthenticatedLimiter);

// Routes
app.use('/api/v1', router);

// 404 handler
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Error handler (must be last)
app.use(errorHandler);

// Local dev server
if (process.env.NODE_ENV === 'development') {
  const port = config.port;
  app.listen(port, () => {
    logger.info(`TAPR API running on http://localhost:${port}`);
  });
}

// Lambda handler
export const handler = serverless(app);
export default app;
