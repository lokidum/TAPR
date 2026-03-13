-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('consumer', 'barber', 'studio', 'admin');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('in_studio', 'mobile', 'on_call');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "ChairListingType" AS ENUM ('daily', 'weekly', 'sick_call', 'permanent');

-- CreateEnum
CREATE TYPE "ChairListingStatus" AS ENUM ('available', 'reserved', 'occupied');

-- CreateEnum
CREATE TYPE "ChairRentalStatus" AS ENUM ('active', 'completed', 'disputed', 'cancelled');

-- CreateEnum
CREATE TYPE "PartnershipStructure" AS ENUM ('unincorporated_jv', 'incorporated_jv', 'partnership');

-- CreateEnum
CREATE TYPE "PartnershipStatus" AS ENUM ('draft', 'sent', 'partially_signed', 'fully_executed', 'dissolved');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('workshop', 'live_activation', 'pop_up', 'guest_spot');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('planning', 'confirmed', 'live', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved_for_claimant', 'resolved_for_respondent', 'escalated');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "phone" TEXT,
    "apple_user_id" TEXT,
    "google_user_id" TEXT,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT,
    "total_verified_cuts" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    "total_ratings" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT,
    "instagram_handle" TEXT,
    "tiktok_handle" TEXT,
    "instagram_access_token" TEXT,
    "tiktok_access_token" TEXT,
    "is_on_call" BOOLEAN NOT NULL DEFAULT false,
    "on_call_activated_at" TIMESTAMPTZ,
    "on_call_location" geometry(Point, 4326),
    "service_radius_km" INTEGER NOT NULL DEFAULT 10,
    "abn" TEXT,
    "aqf_cert_level" TEXT,
    "cert_verified_at" TIMESTAMPTZ,
    "cert_document_url" TEXT,
    "is_sustainable" BOOLEAN NOT NULL DEFAULT false,
    "sustainable_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "barber_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "business_name" TEXT NOT NULL,
    "abn" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "coordinates" geometry(Point, 4326),
    "google_place_id" TEXT,
    "phone" TEXT,
    "website_url" TEXT,
    "chair_count" INTEGER NOT NULL DEFAULT 1,
    "stripe_account_id" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "studio_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consumer_id" UUID NOT NULL,
    "barber_id" UUID NOT NULL,
    "studio_id" UUID,
    "service_type" "ServiceType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "platform_fee_cents" INTEGER NOT NULL,
    "barber_payout_cents" INTEGER NOT NULL,
    "studio_payout_cents" INTEGER,
    "stripe_payment_intent_id" TEXT,
    "stripe_transfer_id" TEXT,
    "cut_rating" INTEGER,
    "experience_rating" INTEGER,
    "review_text" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barber_id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "s3_key" TEXT NOT NULL,
    "cdn_url" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "caption" TEXT,
    "tags" TEXT[],
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "instagram_media_id" TEXT,
    "tiktok_video_id" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "linked_booking_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chair_listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studio_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price_cents_per_day" INTEGER NOT NULL,
    "price_cents_per_week" INTEGER,
    "available_from" TIMESTAMPTZ NOT NULL,
    "available_to" TIMESTAMPTZ NOT NULL,
    "listing_type" "ChairListingType" NOT NULL,
    "min_level_required" INTEGER NOT NULL DEFAULT 1,
    "is_sick_call" BOOLEAN NOT NULL DEFAULT false,
    "sick_call_premium_pct" INTEGER NOT NULL DEFAULT 0,
    "status" "ChairListingStatus" NOT NULL DEFAULT 'available',
    "stripe_listing_fee_payment_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "chair_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chair_rentals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "barber_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "total_price_cents" INTEGER NOT NULL,
    "status" "ChairRentalStatus" NOT NULL DEFAULT 'active',
    "stripe_payment_intent_id" TEXT,
    "escrow_released_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chair_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnerships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "initiating_barber_id" UUID NOT NULL,
    "partner_barber_id" UUID NOT NULL,
    "business_name" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'AU',
    "state" TEXT,
    "structure_type" "PartnershipStructure" NOT NULL,
    "equity_split_pct_initiator" INTEGER NOT NULL,
    "equity_split_pct_partner" INTEGER NOT NULL,
    "platform_equity_pct" INTEGER NOT NULL DEFAULT 7,
    "vesting_months" INTEGER NOT NULL DEFAULT 48,
    "cliff_months" INTEGER NOT NULL DEFAULT 12,
    "docusign_envelope_id" TEXT,
    "document_url" TEXT,
    "status" "PartnershipStatus" NOT NULL DEFAULT 'draft',
    "dissolved_at" TIMESTAMPTZ,
    "dissolution_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partnerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studio_id" UUID,
    "organizer_user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "event_type" "EventType" NOT NULL,
    "location_address" TEXT,
    "location_coordinates" geometry(Point, 4326),
    "google_place_id" TEXT,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "max_attendees" INTEGER,
    "ticket_price_cents" INTEGER NOT NULL DEFAULT 0,
    "has_food_trucks" BOOLEAN NOT NULL DEFAULT false,
    "permit_number" TEXT,
    "permit_acquired_at" TIMESTAMPTZ,
    "insurance_certificate_url" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_via" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID,
    "rental_id" UUID,
    "raised_by" UUID NOT NULL,
    "against" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_urls" TEXT[],
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution_notes" TEXT,
    "admin_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (standard)
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_apple_user_id_key" ON "users"("apple_user_id");
CREATE UNIQUE INDEX "users_google_user_id_key" ON "users"("google_user_id");
CREATE UNIQUE INDEX "barber_profiles_user_id_key" ON "barber_profiles"("user_id");
CREATE UNIQUE INDEX "studio_profiles_user_id_key" ON "studio_profiles"("user_id");

-- CreateIndex (performance — from spec)
CREATE INDEX "idx_barber_profiles_level" ON "barber_profiles"("level");
CREATE INDEX "idx_barber_profiles_on_call" ON "barber_profiles"("is_on_call") WHERE is_on_call = TRUE;
CREATE INDEX "idx_barber_profiles_location" ON "barber_profiles" USING GIST("on_call_location");
CREATE INDEX "idx_studio_profiles_location" ON "studio_profiles" USING GIST("coordinates");
CREATE INDEX "idx_events_location" ON "events" USING GIST("location_coordinates");
CREATE INDEX "idx_bookings_barber_status" ON "bookings"("barber_id", "status");
CREATE INDEX "idx_bookings_consumer" ON "bookings"("consumer_id");
CREATE INDEX "idx_chair_listings_available" ON "chair_listings"("status", "available_from") WHERE status = 'available';
CREATE INDEX "idx_portfolio_barber" ON "portfolio_items"("barber_id", "created_at" DESC);
CREATE INDEX "idx_notifications_user_unread" ON "notifications"("user_id", "is_read") WHERE is_read = FALSE;

-- AddForeignKey
ALTER TABLE "barber_profiles" ADD CONSTRAINT "barber_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "studio_profiles" ADD CONSTRAINT "studio_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studio_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_linked_booking_id_fkey" FOREIGN KEY ("linked_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chair_listings" ADD CONSTRAINT "chair_listings_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studio_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chair_rentals" ADD CONSTRAINT "chair_rentals_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "chair_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chair_rentals" ADD CONSTRAINT "chair_rentals_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_initiating_barber_id_fkey" FOREIGN KEY ("initiating_barber_id") REFERENCES "barber_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_partner_barber_id_fkey" FOREIGN KEY ("partner_barber_id") REFERENCES "barber_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_studio_id_fkey" FOREIGN KEY ("studio_id") REFERENCES "studio_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_rental_id_fkey" FOREIGN KEY ("rental_id") REFERENCES "chair_rentals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_fkey" FOREIGN KEY ("raised_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_against_fkey" FOREIGN KEY ("against") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
