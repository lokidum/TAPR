-- CreateTable
CREATE TABLE "barber_services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barber_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "barber_services_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "service_id" UUID;

-- AddForeignKey
ALTER TABLE "barber_services" ADD CONSTRAINT "barber_services_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
