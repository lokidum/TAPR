import { Job } from 'bullmq';
import { prisma } from '../services/prisma.service';
import { enqueueNotification } from '../services/queue.service';
import logger from '../utils/logger';

const LEVEL_TITLES: Record<number, string> = {
  1: 'Novice',
  2: 'Rising',
  3: 'Senior',
  4: 'Expert',
  5: 'Certified',
  6: 'Master',
};

export interface LevelInput {
  totalVerifiedCuts: number;
  averageRating: number;
  aqfCertLevel: string | null;
  certVerifiedAt: Date | null;
  isLevel6Eligible: boolean;
}

/**
 * Pure level calculation for testing. Determines the highest level a barber qualifies for.
 * Barbers never go down — caller must enforce currentLevel as floor.
 */
export function calculateLevel(input: LevelInput): number {
  const { totalVerifiedCuts, averageRating, aqfCertLevel, certVerifiedAt, isLevel6Eligible } = input;

  // Level 6: admin must have set is_level6_eligible, 4.9+ rating
  if (isLevel6Eligible && averageRating >= 4.9) {
    return 6;
  }

  // Level 5: any cuts, 4.8+ rating, cert required
  if (
    averageRating >= 4.8 &&
    aqfCertLevel != null &&
    aqfCertLevel.trim() !== '' &&
    certVerifiedAt != null
  ) {
    return 5;
  }

  // Level 4: 1000+ cuts, 4.8+ rating
  if (totalVerifiedCuts >= 1000 && averageRating >= 4.8) {
    return 4;
  }

  // Level 3: 250+ cuts, 4.5+ rating
  if (totalVerifiedCuts >= 250 && averageRating >= 4.5) {
    return 3;
  }

  // Level 2: 50+ cuts, 4.0+ rating
  if (totalVerifiedCuts >= 50 && averageRating >= 4.0) {
    return 2;
  }

  // Level 1: default
  return 1;
}

export function getLevelTitle(level: number): string {
  return LEVEL_TITLES[level] ?? 'Novice';
}

export const LEVEL_UP_JOB_NAME = 'level_up_job';

export async function processLevelUpJob(_job: Job): Promise<void> {
  const barbers = await prisma.barberProfile.findMany({
    where: { user: { isActive: true } },
    include: { user: true },
  });

  let levelledUp = 0;

  for (const barber of barbers) {
    try {
      const completedCount = await prisma.booking.count({
        where: { barberId: barber.id, status: 'completed' },
      });

      const reviewedBookings = await prisma.booking.findMany({
        where: {
          barberId: barber.id,
          status: 'completed',
          reviewedAt: { not: null },
          cutRating: { not: null },
          experienceRating: { not: null },
        },
        select: { cutRating: true, experienceRating: true },
      });

      let averageRating = 0;
      if (reviewedBookings.length > 0) {
        const sum = reviewedBookings.reduce(
          (acc, b) => acc + ((b.cutRating ?? 0) + (b.experienceRating ?? 0)) / 2,
          0
        );
        averageRating = Math.round((sum / reviewedBookings.length) * 100) / 100;
      }

      const newLevel = calculateLevel({
        totalVerifiedCuts: completedCount,
        averageRating,
        aqfCertLevel: barber.aqfCertLevel,
        certVerifiedAt: barber.certVerifiedAt,
        isLevel6Eligible: barber.isLevel6Eligible,
      });

      const currentLevel = barber.level;
      const effectiveLevel = Math.max(newLevel, currentLevel);

      await prisma.barberProfile.update({
        where: { id: barber.id },
        data: {
          totalVerifiedCuts: completedCount,
          averageRating,
          totalRatings: reviewedBookings.length,
        },
      });

      if (effectiveLevel > currentLevel) {
        await prisma.barberProfile.update({
          where: { id: barber.id },
          data: {
            level: effectiveLevel,
            title: getLevelTitle(effectiveLevel),
            levelUpPending: true,
          },
        });

        await enqueueNotification({
          userId: barber.userId,
          type: 'LEVEL_UP',
          title: `Level Up! You're now ${getLevelTitle(effectiveLevel)}`,
          body: `Congratulations! You've reached Level ${effectiveLevel}.`,
          data: { level: effectiveLevel, title: getLevelTitle(effectiveLevel) },
        });

        levelledUp++;
        logger.info('Barber levelled up', {
          barberId: barber.id,
          userId: barber.userId,
          fromLevel: currentLevel,
          toLevel: effectiveLevel,
        });
      }
    } catch (err) {
      logger.error('Level-up job failed for barber', { barberId: barber.id, err });
      throw err;
    }
  }

  logger.info('Level-up job completed', {
    barbersProcessed: barbers.length,
    levelledUp,
  });
}
