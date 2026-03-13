import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth.routes';
import usersRouter from './users.routes';
import barbersRouter from './barbers.routes';
import studiosRouter from './studios.routes';
import bookingsRouter from './bookings.routes';
import chairsRouter from './chairs.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/barbers', barbersRouter);
router.use('/studios', studiosRouter);
router.use('/bookings', bookingsRouter);
router.use('/chairs', chairsRouter);

export default router;
