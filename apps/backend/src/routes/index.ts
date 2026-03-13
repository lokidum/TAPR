import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth.routes';
import usersRouter from './users.routes';
import barbersRouter from './barbers.routes';
import studiosRouter from './studios.routes';
import bookingsRouter from './bookings.routes';
import chairsRouter from './chairs.routes';
import notificationsRouter from './notifications.routes';
import partnershipsRouter from './partnerships.routes';
import eventsRouter from './events.routes';
import disputesRouter, { attachBookingDisputeRoute } from './disputes.routes';
import adminRouter from './admin.routes';

const router = Router();

attachBookingDisputeRoute(bookingsRouter);

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/barbers', barbersRouter);
router.use('/studios', studiosRouter);
router.use('/bookings', bookingsRouter);
router.use('/chairs', chairsRouter);
router.use('/notifications', notificationsRouter);
router.use('/partnerships', partnershipsRouter);
router.use('/events', eventsRouter);
router.use('/disputes', disputesRouter);
router.use('/admin', adminRouter);

export default router;
