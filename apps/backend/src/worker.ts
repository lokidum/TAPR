import 'dotenv/config';
import { initializeQueues } from './jobs/queue';
import logger from './utils/logger';

async function main(): Promise<void> {
  await initializeQueues();
  logger.info('BullMQ worker started — level-up job scheduled daily at 2am AEST');
}

main().catch((err: unknown) => {
  logger.error('Worker failed to start', { err });
  process.exit(1);
});
