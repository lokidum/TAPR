import { Queue, Worker } from 'bullmq';
import { getQueueConnection } from '../services/queue.service';
import {
  LEVEL_UP_JOB_NAME,
  processLevelUpJob,
} from './level-up.job';

const LEVEL_UP_QUEUE_NAME = 'level_up';

let _levelUpQueue: Queue | null = null;
let _levelUpWorker: Worker | null = null;

export function getLevelUpQueue(): Queue {
  if (!_levelUpQueue) {
    _levelUpQueue = new Queue(LEVEL_UP_QUEUE_NAME, {
      connection: getQueueConnection(),
      defaultJobOptions: { removeOnComplete: 100 },
    });
  }
  return _levelUpQueue;
}

export function startLevelUpWorker(): Worker {
  if (_levelUpWorker) {
    return _levelUpWorker;
  }
  _levelUpWorker = new Worker(
    LEVEL_UP_QUEUE_NAME,
    async (job) => {
      if (job.name === LEVEL_UP_JOB_NAME) {
        await processLevelUpJob(job);
      }
    },
    {
      connection: getQueueConnection(),
      concurrency: 1,
    }
  );
  return _levelUpWorker;
}

const LEVEL_UP_REPEATABLE_JOB_ID = 'level_up_daily';

export async function registerLevelUpRepeatableJob(): Promise<void> {
  const queue = getLevelUpQueue();
  await queue.add(
    LEVEL_UP_JOB_NAME,
    {},
    { repeat: { pattern: '0 15 * * *' }, jobId: LEVEL_UP_REPEATABLE_JOB_ID }
  );
}

export async function initializeQueues(): Promise<void> {
  startLevelUpWorker();
  await registerLevelUpRepeatableJob();
}
