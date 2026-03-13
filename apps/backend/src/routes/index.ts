import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth.routes';
import usersRouter from './users.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);

export default router;
