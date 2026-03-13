import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth.routes';
import usersRouter from './users.routes';
import barbersRouter from './barbers.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/barbers', barbersRouter);

export default router;
