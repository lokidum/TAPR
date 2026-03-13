-- AlterTable
ALTER TABLE "barber_profiles" ADD COLUMN "is_level6_eligible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "barber_profiles" ADD COLUMN "level_up_pending" BOOLEAN NOT NULL DEFAULT false;
