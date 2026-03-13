# TAPR: Master Development & Deployment Prompt

**Version:** 1.0 — Production Ready  
**Platform:** iOS + Android (Flutter, single codebase)  
**Working Title:** TAPR  
**Classification:** Full-Stack Mobile Application with B2B/B2C Multi-Sided Marketplace

---

> This document is the complete, unambiguous technical specification for the development, deployment, and scaling of TAPR. Every section is intended to be handed directly to a developer, AI coding agent, or dev team lead with zero assumed context. Read it top to bottom before writing a single line of code.

---

## SECTION 1 — PROJECT SUMMARY AND SCOPE

Build a three-sided mobile marketplace that connects:

1. **Consumers** looking for barbers (discovery, booking, reviews)
2. **Barbers** managing their career, portfolio, schedule, and legal agreements
3. **Studios/Shops** renting chairs, scouting talent, and hosting events

The platform runs on a gamified leveling system (Level 1 through 6) that governs barber visibility, pricing access, and feature unlocks. Think of it as LinkedIn for verified credibility, Uber for on-call availability, and Shopify for the individual barber as a portable business unit.

The app must be live on both the Apple App Store and Google Play Store at the end of deployment.

---

## SECTION 2 — TECH STACK (LOCKED)

### Frontend
- **Framework:** Flutter 3.x (Dart)
- **State Management:** Riverpod 2.x (preferred over Bloc for this project due to simpler async handling)
- **Navigation:** Go Router
- **Local Storage:** Hive (for offline caching of barber profiles, chair maps)
- **UI Component Library:** Custom design system built on Flutter Material 3, no third-party UI kits
- **Haptic Feedback:** `flutter_haptic` or native HapticFeedback API on every Level Up event and booking confirmation
- **Video Player:** `video_player` + `chewie` for portfolio feed playback

### Backend
- **Runtime:** Node.js 20.x LTS
- **Framework:** Express.js with TypeScript (strict mode enabled)
- **Architecture:** Serverless on AWS Lambda via the Serverless Framework (v3), API Gateway as the HTTP layer
- **ORM:** Prisma (for PostgreSQL schema management and type-safe queries)
- **Job Queue:** BullMQ on Redis for async tasks (notification dispatch, video processing jobs, level-up recalculations)
- **WebSockets:** AWS API Gateway WebSocket API for real-time chair availability updates

### Databases
- **Primary:** PostgreSQL 15 on AWS RDS (Multi-AZ for production)
- **Cache / Real-Time Layer:** Redis 7 on AWS ElastiCache (chair map state, session tokens, rate limiting counters)
- **Search:** OpenSearch (for barber discovery, geo-radius queries, skill filter combinations)
- **Object Storage:** AWS S3 (portfolio videos, profile images, generated legal PDFs)
- **CDN:** AWS CloudFront in front of S3

### Infrastructure
- **Cloud Provider:** AWS (primary)
- **IaC:** Terraform (all infrastructure defined as code, no manual console provisioning)
- **Container Registry:** AWS ECR (for any containerized workers)
- **Secrets Management:** AWS Secrets Manager (never hardcode credentials, never commit .env files)
- **Monitoring:** Datadog (APM, logs, dashboards)
- **Error Tracking:** Sentry (both Flutter client and Node.js backend)

---

## SECTION 3 — AUTHENTICATION AND OAUTH

### Strategy
Use a **multi-provider auth system** with JWT access tokens and rotating refresh tokens. The access token lifetime is 15 minutes. The refresh token lifetime is 30 days and is stored in Redis with the ability to revoke it instantly (for logout and ban enforcement).

### Login Methods (All Three Must Be Supported)

**1. Apple Sign In (mandatory for iOS App Store approval)**
- Use the `sign_in_with_apple` Flutter package
- Backend validates the Apple identity token via Apple's public key endpoint: `https://appleid.apple.com/auth/keys`
- On first login, extract `email` (note: Apple may relay a private email), `sub` (Apple user ID), and `name`
- Store `apple_user_id` in the `users` table as a unique identifier
- Apple name is only sent on first login. Store it immediately or it is lost permanently.

**2. Google Sign In**
- Use `google_sign_in` Flutter package
- Backend validates the Google ID token via `https://oauth2.googleapis.com/tokeninfo?id_token=TOKEN`
- Extract `sub`, `email`, `name`, `picture`
- Store `google_user_id` in `users` table

**3. Phone Number (OTP via SMS)**
- Use AWS SNS or Twilio (prefer Twilio for reliability in AU/NZ)
- Flow: user enters phone number, backend generates a 6-digit OTP, stores hashed OTP + expiry (5 minutes) in Redis, sends via Twilio SMS
- User submits OTP, backend verifies against Redis hash, issues tokens on match
- Rate limit: max 3 OTP requests per phone number per 10 minutes (enforced in Redis)
- The phone number is the primary identifier for barbers; email is optional for this user type

### JWT Structure
```
Access Token Payload:
{
  "sub": "user_uuid",
  "role": "consumer" | "barber" | "studio" | "admin",
  "level": 1-6,  // for barber role only
  "iat": timestamp,
  "exp": timestamp (15 min)
}

Refresh Token:
- Opaque random 64-byte hex string
- Stored in Redis as: refresh:{token_hash} -> user_uuid (with 30-day TTL)
- Rotated on every use (old token invalidated, new one issued)
```

### Token Delivery
- Access token: response body only
- Refresh token: HttpOnly, Secure, SameSite=Strict cookie for web consumers; stored in Flutter Secure Storage (`flutter_secure_storage`) for mobile
- Never store access tokens in localStorage or AsyncStorage

### OAuth Scopes Needed (Third-Party Platforms)
| Platform | Scopes | Purpose |
|---|---|---|
| Instagram Graph API | `instagram_basic`, `instagram_content_publish` | Portfolio sync and content posting |
| TikTok API | `user.info.basic`, `video.upload`, `video.list` | Auto-post content from Content Engine |
| Google Maps | `Maps SDK`, `Places API`, `Directions API` | Chair Map, barber discovery |
| Stripe Connect | `read_write` on connected accounts | Split payments |
| DocuSign | `signature`, `impersonation` | Legal agreement generation |

---

## SECTION 4 — SECURITY

### Transport
- TLS 1.3 minimum on all endpoints. No TLS 1.0 or 1.1.
- HSTS headers enforced on API Gateway
- Certificate pinning in the Flutter app using the `ssl_pinning_plugin` package — pin to the AWS CloudFront certificate. This prevents MITM attacks on mobile.

### API Security
- **Rate Limiting:** Custom middleware using Redis sliding window counters
  - Unauthenticated endpoints: 20 requests per minute per IP
  - Authenticated endpoints: 200 requests per minute per user
  - OTP endpoints: 3 requests per 10 minutes per phone number
  - Search endpoints: 60 requests per minute per user
- **Input Validation:** Use `zod` on every endpoint. Reject anything that does not match the schema with a 400 and a descriptive error.
- **SQL Injection:** Prisma parameterized queries only. No raw SQL interpolation.
- **XSS:** All user-generated text fields sanitized with `DOMPurify` equivalent server-side before storage.
- **CORS:** Whitelist only the known frontend origins. No wildcard CORS in production.

### Secrets and Environment
- All secrets in AWS Secrets Manager, fetched at Lambda cold start and cached in memory for the duration of the function lifecycle
- Environment-specific config (dev, staging, prod) separated in Terraform workspaces
- Rotate all secrets every 90 days using AWS Secrets Manager rotation policies
- Never log secrets, tokens, or personally identifiable information in plaintext

### Payment Security
- All payment processing via Stripe — never touch raw card data on our backend
- Use Stripe Connect for split payments between barber, studio, and platform
- Implement Stripe Radar for fraud detection
- Webhook signature verification on all Stripe webhook events using `stripe.webhooks.constructEvent`

### Data Privacy (Australian Privacy Act 1988 Compliance)
- User data stored in `ap-southeast-2` (Sydney) AWS region only
- Right to erasure: implement a `DELETE /v1/users/me` endpoint that anonymizes all PII fields and purges S3 assets within 30 days
- Data retention policy: booking records retained 7 years (tax compliance), all other personal data retained until deletion request
- Privacy policy must be linked from both App Store listings before approval

### File Upload Security
- All uploads go to a pre-signed S3 URL generated by the backend. The client never has AWS credentials.
- Pre-signed URL expiry: 5 minutes
- File type validation: MIME type checked server-side using `file-type` npm package after upload
- Max file sizes: profile image 5MB, portfolio video 500MB
- Malware scanning: AWS Macie on the S3 bucket for sensitive data detection

---

## SECTION 5 — DATABASE SCHEMA (CORE TABLES)

All tables use UUID primary keys. All timestamps are UTC. All monetary values stored in cents (integer) to avoid floating point.

```sql
-- USERS (base identity for all roles)
users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  apple_user_id TEXT UNIQUE,
  google_user_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('consumer', 'barber', 'studio', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  is_banned BOOLEAN DEFAULT FALSE,
  ban_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- BARBER PROFILES
barber_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER DEFAULT 1 CHECK (level BETWEEN 1 AND 6),
  title TEXT,  -- 'Novice', 'Junior', etc.
  total_verified_cuts INTEGER DEFAULT 0,
  average_rating NUMERIC(3,2) DEFAULT 0.00,
  total_ratings INTEGER DEFAULT 0,
  bio TEXT,
  instagram_handle TEXT,
  tiktok_handle TEXT,
  instagram_access_token TEXT,  -- encrypted at rest
  tiktok_access_token TEXT,     -- encrypted at rest
  is_on_call BOOLEAN DEFAULT FALSE,
  on_call_activated_at TIMESTAMPTZ,
  on_call_location POINT,       -- PostGIS geometry
  service_radius_km INTEGER DEFAULT 10,
  abn TEXT,                     -- Australian Business Number
  aqf_cert_level TEXT,          -- 'cert_iii', 'cert_iv', 'diploma'
  cert_verified_at TIMESTAMPTZ,
  cert_document_url TEXT,
  is_sustainable BOOLEAN DEFAULT FALSE,
  sustainable_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- STUDIO PROFILES
studio_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  abn TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  suburb TEXT,
  state TEXT,
  postcode TEXT,
  coordinates POINT,            -- PostGIS
  google_place_id TEXT,
  phone TEXT,
  website_url TEXT,
  chair_count INTEGER DEFAULT 1,
  stripe_account_id TEXT,       -- Stripe Connect account
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- BOOKINGS
bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id UUID REFERENCES users(id),
  barber_id UUID REFERENCES barber_profiles(id),
  studio_id UUID REFERENCES studio_profiles(id),  -- nullable for mobile
  service_type TEXT CHECK (service_type IN ('in_studio', 'mobile', 'on_call')),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'disputed'
  )),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  barber_payout_cents INTEGER NOT NULL,
  studio_payout_cents INTEGER,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT,
  cut_rating INTEGER CHECK (cut_rating BETWEEN 1 AND 5),
  experience_rating INTEGER CHECK (experience_rating BETWEEN 1 AND 5),
  review_text TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- PORTFOLIO ITEMS
portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id UUID REFERENCES barber_profiles(id) ON DELETE CASCADE,
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  s3_key TEXT NOT NULL,
  cdn_url TEXT NOT NULL,
  thumbnail_url TEXT,
  caption TEXT,
  tags TEXT[],
  is_featured BOOLEAN DEFAULT FALSE,
  instagram_media_id TEXT,
  tiktok_video_id TEXT,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  linked_booking_id UUID REFERENCES bookings(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- CHAIR LISTINGS (Rent-a-Chair marketplace)
chair_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID REFERENCES studio_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_cents_per_day INTEGER NOT NULL,
  price_cents_per_week INTEGER,
  available_from TIMESTAMPTZ NOT NULL,
  available_to TIMESTAMPTZ NOT NULL,
  listing_type TEXT CHECK (listing_type IN ('daily', 'weekly', 'sick_call', 'permanent')),
  min_level_required INTEGER DEFAULT 1,
  is_sick_call BOOLEAN DEFAULT FALSE,
  sick_call_premium_pct INTEGER DEFAULT 0,  -- additional % on top of base rate
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'occupied')),
  stripe_listing_fee_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- CHAIR RENTALS
chair_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES chair_listings(id),
  barber_id UUID REFERENCES barber_profiles(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  total_price_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'disputed', 'cancelled')),
  stripe_payment_intent_id TEXT,
  escrow_released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- LEGAL PARTNERSHIPS (Co-Op Builder)
partnerships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiating_barber_id UUID REFERENCES barber_profiles(id),
  partner_barber_id UUID REFERENCES barber_profiles(id),
  business_name TEXT,
  jurisdiction TEXT DEFAULT 'AU',
  state TEXT,
  structure_type TEXT CHECK (structure_type IN ('unincorporated_jv', 'incorporated_jv', 'partnership')),
  equity_split_pct_initiator INTEGER,
  equity_split_pct_partner INTEGER,
  platform_equity_pct INTEGER DEFAULT 7,
  vesting_months INTEGER DEFAULT 48,
  cliff_months INTEGER DEFAULT 12,
  docusign_envelope_id TEXT,
  document_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'partially_signed', 'fully_executed', 'dissolved'
  )),
  dissolved_at TIMESTAMPTZ,
  dissolution_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- EVENTS
events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID REFERENCES studio_profiles(id),
  organizer_user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT CHECK (event_type IN ('workshop', 'live_activation', 'pop_up', 'guest_spot')),
  location_address TEXT,
  location_coordinates POINT,
  google_place_id TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_attendees INTEGER,
  ticket_price_cents INTEGER DEFAULT 0,
  has_food_trucks BOOLEAN DEFAULT FALSE,
  permit_number TEXT,
  permit_acquired_at TIMESTAMPTZ,
  insurance_certificate_url TEXT,
  status TEXT DEFAULT 'planning' CHECK (status IN (
    'planning', 'confirmed', 'live', 'completed', 'cancelled'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- NOTIFICATIONS
notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  sent_via TEXT[],  -- ['push', 'email', 'sms']
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- DISPUTES
disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id),
  rental_id UUID REFERENCES chair_rentals(id),
  raised_by UUID REFERENCES users(id),
  against UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  evidence_urls TEXT[],
  status TEXT DEFAULT 'open' CHECK (status IN (
    'open', 'under_review', 'resolved_for_claimant', 'resolved_for_respondent', 'escalated'
  )),
  resolution_notes TEXT,
  admin_id UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- INDEXES (non-negotiable for performance)
CREATE INDEX idx_barber_profiles_level ON barber_profiles(level);
CREATE INDEX idx_barber_profiles_on_call ON barber_profiles(is_on_call) WHERE is_on_call = TRUE;
CREATE INDEX idx_barber_profiles_location ON barber_profiles USING GIST(on_call_location);
CREATE INDEX idx_studio_profiles_location ON studio_profiles USING GIST(coordinates);
CREATE INDEX idx_bookings_barber_status ON bookings(barber_id, status);
CREATE INDEX idx_bookings_consumer ON bookings(consumer_id);
CREATE INDEX idx_chair_listings_available ON chair_listings(status, available_from) WHERE status = 'available';
CREATE INDEX idx_portfolio_barber ON portfolio_items(barber_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
```

Enable PostGIS extension on the PostgreSQL instance. It is required for all geo queries.

---

## SECTION 6 — BACKEND API SPECIFICATION

All routes are prefixed `/api/v1`. All requests require `Content-Type: application/json`. Authenticated routes require `Authorization: Bearer {access_token}`.

### 6.1 Auth Routes

```
POST   /auth/apple              Body: { identityToken, fullName? }
POST   /auth/google             Body: { idToken }
POST   /auth/otp/request        Body: { phone }
POST   /auth/otp/verify         Body: { phone, otp }
POST   /auth/refresh            Cookie: refresh_token
POST   /auth/logout             Auth required
DELETE /auth/sessions/all       Auth required — revoke all refresh tokens for user
```

### 6.2 User Routes

```
GET    /users/me                Auth required
PATCH  /users/me                Auth required — Body: { fullName, avatarUrl }
DELETE /users/me                Auth required — triggers 30-day anonymization job
GET    /users/:id/public        Public — returns non-PII profile data
```

### 6.3 Barber Profile Routes

```
GET    /barbers/me              Auth required (barber role)
PATCH  /barbers/me              Auth required — update bio, handles, ABN, etc.
POST   /barbers/me/on-call      Auth required — toggle on-call with current coordinates
DELETE /barbers/me/on-call      Auth required — deactivate on-call mode
GET    /barbers/nearby          Query: { lat, lng, radiusKm, minLevel, maxLevel, maxPrice }
GET    /barbers/:id             Public — barber detail view
GET    /barbers/:id/portfolio   Public — paginated portfolio items
GET    /barbers/:id/reviews     Public — paginated reviews
POST   /barbers/me/portfolio    Auth required — initiate S3 upload, returns presigned URL
PATCH  /barbers/me/portfolio/:itemId   Auth required
DELETE /barbers/me/portfolio/:itemId   Auth required
POST   /barbers/me/portfolio/:itemId/sync   Auth required — trigger social media sync
```

### 6.4 Consumer Routes

```
GET    /consumers/me            Auth required (consumer role)
PATCH  /consumers/me            Auth required
GET    /consumers/me/bookings   Auth required — paginated booking history
```

### 6.5 Booking Routes

```
POST   /bookings                Auth required (consumer) — create booking
GET    /bookings/:id            Auth required — both parties can view
PATCH  /bookings/:id/confirm    Auth required (barber)
PATCH  /bookings/:id/cancel     Auth required — cancellation rules apply
PATCH  /bookings/:id/complete   Auth required (barber) — triggers payout
POST   /bookings/:id/review     Auth required (consumer) — submit cut + experience rating
POST   /bookings/:id/dispute    Auth required — raise dispute
GET    /bookings/barber/upcoming Auth required (barber)
GET    /bookings/barber/history  Auth required (barber) — paginated
```

### 6.6 Chair Marketplace Routes

```
POST   /chairs                  Auth required (studio) — create listing, charges $5 listing fee
GET    /chairs/nearby           Query: { lat, lng, radiusKm, listingType, minLevel }
GET    /chairs/:id              Public
PATCH  /chairs/:id              Auth required (studio owner)
DELETE /chairs/:id              Auth required (studio owner)
POST   /chairs/:id/rent         Auth required (barber) — initiate rental payment
PATCH  /chairs/:id/rentals/:rentalId/complete  Auth required (studio)
POST   /chairs/:id/rentals/:rentalId/dispute   Auth required
```

### 6.7 Studio Routes

```
GET    /studios/me              Auth required (studio role)
PATCH  /studios/me              Auth required
GET    /studios/nearby          Query: { lat, lng, radiusKm }
GET    /studios/:id             Public
GET    /studios/:id/listings    Public — active chair listings
POST   /studios/me/talent-search  Auth required — filter barbers for hiring
GET    /studios/:id/events      Public
```

### 6.8 Partnership Routes

```
POST   /partnerships            Auth required (barber, level 5+) — draft agreement
GET    /partnerships/me         Auth required — list my partnerships
GET    /partnerships/:id        Auth required (either party)
POST   /partnerships/:id/send   Auth required (initiator) — send to DocuSign
POST   /partnerships/:id/dissolve  Auth required — initiate dissolution
```

### 6.9 Event Routes

```
POST   /events                  Auth required (studio or admin)
GET    /events                  Query: { lat, lng, radiusKm, type, from, to }
GET    /events/:id              Public
PATCH  /events/:id              Auth required (organizer)
POST   /events/:id/attend       Auth required (consumer or barber)
DELETE /events/:id/attend       Auth required
```

### 6.10 Notification Routes

```
GET    /notifications           Auth required — paginated
PATCH  /notifications/:id/read  Auth required
PATCH  /notifications/read-all  Auth required
POST   /notifications/register-device  Auth required — Body: { pushToken, platform }
```

### 6.11 Admin Routes (role: admin only)

```
GET    /admin/users             Query: { role, isBanned, search }
PATCH  /admin/users/:id/ban     Body: { reason }
PATCH  /admin/users/:id/unban
PATCH  /admin/barbers/:id/verify-cert  Body: { aqfLevel }
PATCH  /admin/barbers/:id/set-level    Body: { level }
GET    /admin/disputes          Query: { status }
PATCH  /admin/disputes/:id/resolve    Body: { status, notes }
GET    /admin/partnerships/:id
GET    /admin/metrics           Returns platform-wide analytics
```

### 6.12 Webhook Routes (no auth middleware, use signature verification)

```
POST   /webhooks/stripe         Stripe-Signature header verification required
POST   /webhooks/docusign       HMAC verification required
```

---

## SECTION 7 — MAPS AND LOCATION

### Google Maps Integration

Enable the following APIs in Google Cloud Console for the project:
- Maps SDK for Android
- Maps SDK for iOS
- Places API (New)
- Directions API
- Geocoding API
- Distance Matrix API

Use the `google_maps_flutter` Flutter package for the map widget.

**Chair Map Implementation**
- On load, fetch `/chairs/nearby` with user's current coordinates and default 10km radius
- Render custom map markers: gold pin for available chairs, grey for occupied
- Real-time updates via WebSocket subscription to the `chair_availability` channel
- On marker tap, show bottom sheet with studio name, available levels, price per day, and a "Request Rental" CTA
- Cluster markers at zoom level less than 12 using `google_maps_cluster_manager`

**Barber Discovery Map**
- Toggle between list view and map view on the discovery screen
- On-call barbers shown as animated pulsing markers (gold circle, radius proportional to their service range)
- Fetch on-call barbers every 60 seconds via polling when map is visible (WebSocket preferred if feasible)

**Geofencing for Events**
- Use `geofence_service` Flutter package
- When a confirmed event attendee enters within 200m of a Federation Square event, trigger a push notification with the event schedule

**Location Permissions**
- Request `whenInUse` location permission for consumers and studios
- Request `always` location permission for barbers with on-call mode enabled (with clear explanation in an in-app dialog before system prompt)
- If permission is denied, degrade gracefully: allow manual suburb search instead
- Never request location in the background without explicit on-call toggle from barber

**Backend Geo Queries**
All proximity queries use PostGIS:
```sql
SELECT *, 
  ST_Distance(coordinates::geography, ST_MakePoint($lng, $lat)::geography) / 1000 AS distance_km
FROM studio_profiles
WHERE ST_DWithin(
  coordinates::geography,
  ST_MakePoint($lng, $lat)::geography,
  $radius_meters
)
ORDER BY distance_km ASC
LIMIT 50;
```

---

## SECTION 8 — PAYMENT ARCHITECTURE (STRIPE CONNECT)

### Account Type
Use Stripe Connect **Express accounts** for barbers and studios. This handles identity verification (KYC), tax forms, and payouts automatically via Stripe's dashboard.

### Onboarding Flow
1. Barber/studio taps "Set Up Payouts" in their profile
2. Backend calls `stripe.accounts.create({ type: 'express', country: 'AU', capabilities: { transfers: { requested: true } } })`
3. Store the returned `account_id` in `barber_profiles.stripe_account_id` or `studio_profiles.stripe_account_id`
4. Backend calls `stripe.accountLinks.create(...)` and returns the onboarding URL to the client
5. Client opens the URL in a WebView or in-app browser
6. On completion, Stripe sends a webhook `account.updated` — mark the account as verified in our DB

### Payment Flow for a Consumer Booking
1. Consumer confirms booking
2. Backend creates a `PaymentIntent` with `capture_method: 'manual'` and `on_behalf_of: barberStripeAccountId`
3. Client collects card details via `flutter_stripe` and confirms the payment intent
4. Payment is authorized but not captured (held in escrow)
5. On booking completion (barber taps "Complete"), backend captures the intent and triggers transfers:
   - Platform fee (10%) retained automatically
   - Barber payout transferred to their Express account immediately
   - If a studio is involved, studio cut transferred to studio's Express account
6. If cancelled before 24h: full refund. If cancelled within 24h: 50% refund. No-show: no refund.

### Chair Rental Payment
- Same flow but with a 48-hour escrow release window
- If no dispute is raised within 48 hours of rental end, funds auto-release via a BullMQ delayed job
- Disputes freeze the escrow until admin resolves

### Listing Fees
- $5/day per chair listing charged to the studio at listing creation via a one-off PaymentIntent
- This is a non-refundable platform fee and does not go through Stripe Connect (goes to platform account)

### Testing
- Use Stripe test mode with `stripe listen --forward-to localhost:3000/webhooks/stripe` for local webhook testing
- Test all failure scenarios: card declined, insufficient funds, payout failure

---

## SECTION 9 — PUSH NOTIFICATIONS

### Service
- **iOS:** Apple Push Notification Service (APNs) via Firebase Cloud Messaging (FCM) using the APNs provider API. Use FCM as the unified sender for both platforms.
- **Android:** FCM directly
- Flutter package: `firebase_messaging`

### Setup
1. Create a Firebase project for TAPR
2. Add Android and iOS apps in Firebase console
3. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) — add to the respective project directories but never commit to git (add to .gitignore, store in CI secrets)
4. In Apple Developer Portal: create an APNs key and upload to Firebase
5. Backend sends notifications via the Firebase Admin SDK (`firebase-admin` npm package)

### Notification Types and Triggers

| Event | Recipients | Title | Body |
|---|---|---|---|
| Booking confirmed | Consumer | "Booking Confirmed" | "{BarberName} has confirmed your {time} appointment" |
| Booking reminder | Consumer + Barber | "Appointment in 1 Hour" | "Your {time} appointment is coming up" |
| Level Up | Barber | "You've Levelled Up" | "You're now Level {n} — {Title}. New features unlocked." |
| New review | Barber | "New Review" | "A client left you a {rating}-star review" |
| Sick call nearby | On-call barbers (radius) | "Sick Call Alert" | "{Studio} needs a Level {n}+ barber now. $X premium rate." |
| Chair listed nearby | Barbers in area | "New Chair Available" | "{Studio} listed a chair from ${price}/day near you" |
| New rental request | Studio | "Rental Request" | "{BarberName} (Level {n}) wants to rent your chair" |
| Partnership signed | Both barbers | "Agreement Signed" | "Your Co-Op agreement has been fully executed" |
| Dispute opened | Other party + admins | "Dispute Raised" | "A dispute has been raised on booking #{id}" |
| Geofence enter (event) | Attendees | "You're at the event!" | "Welcome to {EventName}. Here's your schedule." |

All notifications are also stored in the `notifications` table for in-app notification center display.

---

## SECTION 10 — CONTENT ENGINE (VIDEO EDITOR)

### SDK Selection
Integrate **Banuba Video Editor SDK** (iOS and Android). It provides:
- Beat-sync transitions
- AR face filters (for before/after overlays)
- AI-powered clip selection
- Background replacement
- Caption generation

Alternatively if Banuba licensing cost is prohibitive at MVP stage, use **IMG.LY CreativeEditor SDK** which has a more flexible pricing tier.

### Integration Method
Banuba provides Flutter wrappers. Follow their official Flutter integration guide:
- Add the Banuba `VideoEditorModule` as a Flutter method channel
- License key stored in AWS Secrets Manager, fetched at runtime (never hardcoded)
- The editor is launched as a full-screen modal from within the Barber Pro Portal

### Export Flow
1. Barber records or selects video from camera roll
2. Launches the in-app editor, applies transitions and music
3. On export, the video is processed and saved locally (temp file)
4. Flutter app uploads to backend via pre-signed S3 URL
5. Backend registers the portfolio item in DB
6. Backend enqueues a BullMQ job: `social_sync_job`
7. The job calls TikTok and Instagram APIs with the video URL and caption
8. On success, stores the returned media IDs in `portfolio_items.tiktok_video_id` and `portfolio_items.instagram_media_id`

### Watermarks
All exported videos must carry the TAPR watermark (bottom-right, semi-transparent). The watermark asset is bundled with the app and applied at the Banuba template level, not removable by the user.

---

## SECTION 11 — LEGAL DOCUMENT GENERATION (DOCUSIGN)

### Setup
1. Create a DocuSign Developer account and create an integration app
2. Use OAuth 2.0 JWT Grant for server-to-server authentication (no user login to DocuSign required)
3. Store the RSA private key in AWS Secrets Manager
4. The backend uses `docusign-esign` npm SDK

### Partnership Agreement Generation Flow
1. Two Level 5+ barbers initiate a partnership via the app
2. Frontend collects: business name, state, structure type, equity split, capital contributions, vesting terms
3. Backend validates both barbers are Level 5+
4. Backend fills a pre-built DocuSign template (created in the DocuSign template library) with the submitted data
5. Backend calls `EnvelopesApi.createEnvelope` to create and send the envelope to both barbers' email addresses
6. Store `envelope_id` in `partnerships.docusign_envelope_id`
7. DocuSign sends a webhook on status change (`envelope-completed`, `envelope-declined`)
8. On `envelope-completed`: download the signed PDF via DocuSign API, upload to S3, store URL in `partnerships.document_url`, update status to `fully_executed`

### Legal Templates Required (build in DocuSign Template Library)
- Barber-to-Barber Co-Op Joint Venture Agreement (AU jurisdiction)
- Chair Rental (Salon License) Agreement
- Independent Contractor Service Agreement (sham contracting safe)
- Event Co-Organizer Agreement

All templates should be reviewed by an Australian commercial lawyer before production launch. This is not optional.

---

## SECTION 12 — LEVELING SYSTEM LOGIC

The Level Up calculation runs as a background job, not in real-time, to prevent gaming. It runs every 24 hours at 2am AEST via a BullMQ scheduled job.

### Level Rules

| Level | Minimum Verified Cuts | Minimum Avg Rating | Additional Requirements |
|---|---|---|---|
| 1 | 0 | N/A | Account created |
| 2 | 50 | 4.0 | None |
| 3 | 250 | 4.5 | None |
| 4 | 1000 | 4.8 | None |
| 5 | Any | 4.8 | Must hold AQF Cert III minimum, verified by admin |
| 6 | Any | 4.9 | Industry award or publication verified by admin |

### Calculation Job Logic
```
For each barber_profile:
  1. Count bookings where status = 'completed' and linked to this barber -> verified_cuts
  2. Average the cut_rating and experience_rating (equal weight) -> avg_rating
  3. Update total_verified_cuts and average_rating in barber_profiles
  4. Check if barber qualifies for a higher level based on the rules table
  5. If level increases:
     a. Update barber_profiles.level and title
     b. Insert a notification record for Level Up
     c. Enqueue a push notification via FCM
     d. Trigger haptic feedback on client (happens on next app open via a flag in the user's profile)
  6. A barber can NEVER go down a level once achieved (ratings are smoothed, not retroactively downgraded)
```

### Visibility Rules Enforced by the Algorithm
- Barbers at Level 1-2 do not appear in search results by default (they must opt into a "Learning Mode" listing)
- Level 3+ barbers appear in standard search
- Level 6 barbers are featured at the top of the discovery feed in the "Legendary" section
- The "Sick Call Hero" feature is only accessible via the backend to Level 3+ barbers — enforced at the API layer, not just the UI

---

## SECTION 13 — SOCIAL FEED (PORTFOLIO FEED)

### Structure
A TikTok-style full-screen vertical scroll showing portfolio videos from barbers within 5km of the consumer's current location. This is the home screen for consumers.

### Implementation
- Use a `PageView` widget in Flutter with `scrollDirection: Axis.vertical`
- Pre-load the next 3 items while the current one plays (using `video_player` controller pool)
- Lazy-load in pages of 10 via `/barbers/nearby?mediaType=video&limit=10&page=X`
- Items are ranked by: proximity (40%), recency (30%), barber level (20%), engagement (10%)
- Ranking is computed server-side by OpenSearch scoring

### Engagement Tracking
- Log a view event when a video is visible for more than 3 seconds
- Track pause/replay events via analytics
- "Like" is a double-tap gesture (like TikTok)
- Share opens the native share sheet with a deep link to the barber's profile

### Deep Linking
Use **Firebase Dynamic Links** (or the newer successor, custom scheme with `app_links` Flutter package):
- `sovereigncut://barbers/{barber_id}` opens barber profile
- `sovereigncut://bookings/{booking_id}` opens booking detail
- `sovereigncut://events/{event_id}` opens event detail
- All deep links also have web fallback URLs for non-installed users (opens App Store / Play Store)

---

## SECTION 14 — DESIGN SYSTEM SPECIFICATION

### Palette
| Token | Hex | Usage |
|---|---|---|
| `color-background` | #1A1A1A | Primary background |
| `color-surface` | #242424 | Cards, bottom sheets, modals |
| `color-gold` | #C5A059 | Primary CTA, accents, Level badges |
| `color-gold-muted` | #8A6E3A | Secondary accents, disabled states |
| `color-white` | #FFFFFF | Primary text |
| `color-text-secondary` | #A0A0A0 | Labels, captions |
| `color-error` | #E05555 | Error states, disputes |
| `color-success` | #4CAF7D | Completed bookings, verified badges |
| `color-divider` | #2E2E2E | Dividers, borders |

### Typography
- **Font Family:** Inter (import via Google Fonts, `google_fonts` Flutter package)
- **Heading 1:** Inter Bold, 28sp
- **Heading 2:** Inter SemiBold, 22sp
- **Heading 3:** Inter SemiBold, 18sp
- **Body:** Inter Regular, 16sp, line-height 1.5
- **Caption:** Inter Regular, 13sp, color-text-secondary
- **Label / Badge:** Inter Bold, 11sp, all-caps, letter-spacing 1.2

### Haptics
Every significant action fires a haptic pattern. Use `flutter_haptic` or the native HapticFeedback class:
- Booking confirmed: `HapticFeedback.heavyImpact()`
- Level Up: custom pattern (three medium impacts with 100ms gaps using `HapticFeedback.mediumImpact()`)
- Like on portfolio item: `HapticFeedback.lightImpact()`
- Dispute submitted: `HapticFeedback.vibrate()`

### Iconography
Use `Lucide Icons` via the `lucide_icons` Flutter package. Do not mix icon sets.

### Navigation Structure
```
Bottom Tab Bar (consumers and barbers share this shell):
  Tab 1 — Discover (Portfolio Feed / Map toggle)
  Tab 2 — Book / My Schedule (context-aware based on role)
  Tab 3 — Marketplace (Chair Map for barbers, Barber Search for consumers)
  Tab 4 — Legal Hub (partnerships, agreements) — barbers only, hidden for consumers
  Tab 5 — Profile

Studio users get a separate dedicated shell:
  Tab 1 — Dashboard (occupancy, revenue)
  Tab 2 — Chair Manager (listings)
  Tab 3 — Talent Scout
  Tab 4 — Events
  Tab 5 — Profile
```

---

## SECTION 15 — APP STORE DEPLOYMENT

### iOS App Store

**Requirements checklist (all must be done before submission):**
1. Apple Developer Program membership ($149/year) must be active
2. App ID created in Apple Developer Portal with the bundle ID: `com.sovereigncut.app`
3. Enable the following capabilities in the App ID: Push Notifications, Sign in with Apple, Associated Domains (for deep links), Background Modes (Background Fetch, Remote Notifications)
4. Create production APNs key and upload to Firebase
5. Create a Distribution Certificate and Provisioning Profile (App Store distribution)
6. In Xcode: set the deployment target to iOS 15.0 minimum
7. All Info.plist entries required:
   - `NSLocationWhenInUseUsageDescription` — "We use your location to show nearby barbers and studios."
   - `NSLocationAlwaysAndWhenInUseUsageDescription` — "Barbers using On-Call mode need background location to appear on the map for clients."
   - `NSCameraUsageDescription` — "The camera is used to record portfolio videos."
   - `NSPhotoLibraryUsageDescription` — "Access your photo library to upload portfolio content."
   - `NSMicrophoneUsageDescription` — "The microphone is used when recording video content."
8. App Store Connect: create the app listing
   - App name: TAPR
   - Subtitle: Book. Cut. Level Up.
   - Category: Lifestyle (primary), Business (secondary)
   - Age rating: 4+ (no objectionable content)
   - Privacy Policy URL: must be live before submission
   - Support URL: must be a real support page
9. Screenshots required: 6.7" (iPhone 14 Pro Max), 5.5" (iPhone 8 Plus), 12.9" iPad Pro — minimum 3 screenshots per device
10. App preview video: optional but strongly recommended for the portfolio feed feature
11. In-app purchases: if the $29/mo Pro subscription goes through the App Store, register it in App Store Connect with `com.sovereigncut.pro.monthly` product ID and use the `in_app_purchase` Flutter package. Note: Apple takes 30% (15% for subscriptions after year 1).
12. Review notes for App Review team: include a test account (demo consumer and demo barber) with credentials in the "Notes for Reviewer" field. The on-call and location features especially need to be explained.
13. Export compliance: answer "No" to encryption question unless you are implementing custom encryption beyond standard HTTPS (standard TLS does not require export compliance declaration)

**Submission process:**
1. Archive in Xcode (Product > Archive)
2. Distribute via App Store Connect (automatic code signing)
3. Upload via Xcode Organizer or Transporter app
4. Submit for review in App Store Connect
5. Average review time is 24-48 hours for new apps

### Google Play Store

**Requirements checklist:**
1. Google Play Developer account ($25 one-time fee)
2. Create app in Google Play Console
   - Package name: `com.sovereigncut.app`
   - App category: Lifestyle
   - Content rating: complete the questionnaire (expected rating: Everyone)
3. Enable the following in `AndroidManifest.xml`:
   - `ACCESS_FINE_LOCATION`
   - `ACCESS_COARSE_LOCATION`
   - `ACCESS_BACKGROUND_LOCATION` (required for on-call mode, must be justified)
   - `CAMERA`
   - `READ_MEDIA_IMAGES`
   - `READ_MEDIA_VIDEO`
   - `POST_NOTIFICATIONS` (Android 13+)
   - `VIBRATE`
   - `INTERNET`
   - `RECEIVE_BOOT_COMPLETED` (for scheduled notifications)
4. Target SDK: Android 14 (API 34) minimum. Compile SDK: 34.
5. `minSdkVersion`: 26 (Android 8.0 Oreo) — matches video editor SDK requirements
6. Generate a release keystore. Store the keystore file and passwords in a secure secrets manager. If this keystore is lost, the app cannot be updated.
7. Sign the release APK/AAB with the keystore
8. Upload an Android App Bundle (.aab) not an APK — Play Store requires AAB since August 2021
9. Data safety form: complete this honestly based on what data the app collects. It must match the privacy policy. This is checked by Google reviewers.
10. Google Play requires a privacy policy link before going live
11. If using Stripe for in-app purchases of the Pro subscription, be aware Google Play Billing is required for digital goods purchased within the app. This means Google takes 15-30%. Evaluate whether the subscription is a digital service (use Play Billing) or a SaaS platform fee (may qualify for alternative billing).
12. Create signed release builds using:
```
flutter build appbundle --release
```
13. Upload the `.aab` file to the production track in Play Console

### Shared Pre-Launch Checklist (Both Stores)
- All debug logs stripped from production builds (`flutter build --release`)
- All console.log and print statements removed
- Network calls point to production API endpoints only
- Sentry DSN is set to production project
- Firebase project is set to production (not the debug project)
- All test payment keys replaced with live Stripe keys
- Privacy policy and terms of service are live at accessible URLs
- In-app crash reporting is live and monitored
- Load test the backend before launch (at least 500 concurrent users simulation using Artillery)

---

## SECTION 16 — CI/CD PIPELINE

### Tooling
- **Source Control:** GitHub (private repo, branch protection on `main` and `staging`)
- **CI/CD:** GitHub Actions

### Branch Strategy
```
main          — production. Tagged releases only.
staging       — pre-production. Deployed to staging environment automatically.
develop       — integration branch. PRs merge here first.
feature/*     — individual feature branches
hotfix/*      — for production bug fixes
```

### GitHub Actions Workflows

**1. PR validation (triggers on every PR to `develop` or `staging`):**
```yaml
- Dart/Flutter analyze (flutter analyze --fatal-infos)
- Flutter test (flutter test --coverage)
- Node.js ESLint (no warnings allowed in production)
- Node.js Jest tests (must pass 100%)
- Terraform plan (for infra changes)
- Upload coverage to Codecov (minimum 80% coverage required)
```

**2. Staging deploy (triggers on merge to `staging`):**
```yaml
- Build Flutter app (staging flavor)
- Run integration tests on Firebase Test Lab (real devices)
- Deploy backend to staging Lambda via Serverless Framework
- Run database migrations via Prisma migrate deploy
- Post deployment notification to Slack #deployments
```

**3. Production deploy (triggers on merge to `main`):**
```yaml
- Require manual approval gate (at least one senior engineer)
- Build Flutter release (iOS + Android)
- Upload iOS .ipa to TestFlight via Fastlane
- Upload Android .aab to Play Console internal track via Fastlane
- Deploy backend to production Lambda
- Run migrations
- Create GitHub Release with changelog
- Post to Slack #releases
```

### Fastlane Setup
Use Fastlane for automated iOS and Android build and deployment:
- `Fastfile` configured for both platforms
- Fastlane Match for iOS code signing (certificates stored in a private GitHub repo, encrypted)
- Fastlane Supply for Play Store uploads
- Fastlane Pilot for TestFlight uploads

---

## SECTION 17 — MONITORING AND OBSERVABILITY

### Datadog Setup
- APM tracing on all Express routes (use `dd-trace` npm package, auto-instrument at app entry)
- Custom metrics:
  - `sovereign.bookings.created` (count)
  - `sovereign.level_ups.count` (count with level tag)
  - `sovereign.chair.rentals` (count)
  - `sovereign.video.sync.success` / `sovereign.video.sync.failure` (count)
  - `sovereign.payment.captured` (count and sum of value)
- Dashboards: one for real-time operational health, one for business metrics
- Alerts:
  - API error rate > 1% over 5 minutes
  - Lambda cold start P95 > 3000ms
  - Stripe webhook failure > 3 in 10 minutes
  - Database connection pool exhaustion

### Sentry Setup
- Flutter Sentry SDK: `sentry_flutter` package
- Node.js Sentry SDK: `@sentry/node` with Express integration
- Separate projects in Sentry for iOS, Android, and backend
- Release tracking enabled so errors are tied to specific app versions
- Performance monitoring enabled on checkout flow and booking creation

### Logging
- All Lambda logs shipped to Datadog via the Datadog Forwarder Lambda
- Log format: structured JSON always (`{ timestamp, level, message, requestId, userId, ...context }`)
- Never log: passwords, tokens, card numbers, full phone numbers, full ABNs

### Uptime Monitoring
- External uptime check every 60 seconds on `/api/v1/health` from at least 3 regions
- Pagerduty integration for on-call alerting (P1 incidents wake up the on-call engineer)

---

## SECTION 18 — ENVIRONMENT CONFIGURATION

### Required Environment Variables

**Backend (all stored in AWS Secrets Manager, structured as JSON per environment):**
```
DATABASE_URL                    — PostgreSQL connection string
REDIS_URL                       — Redis connection string
JWT_ACCESS_SECRET               — 256-bit random string
JWT_REFRESH_SECRET              — 256-bit random string (different from access)
APPLE_TEAM_ID
APPLE_CLIENT_ID
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PLATFORM_ACCOUNT_ID
AWS_S3_BUCKET_NAME
AWS_CLOUDFRONT_DOMAIN
GOOGLE_MAPS_API_KEY
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET
DOCUSIGN_INTEGRATION_KEY
DOCUSIGN_USER_ID
DOCUSIGN_RSA_PRIVATE_KEY
DOCUSIGN_PARTNERSHIP_TEMPLATE_ID
DOCUSIGN_RENTAL_TEMPLATE_ID
FIREBASE_SERVICE_ACCOUNT_JSON
BANUBA_LICENSE_KEY
SENTRY_DSN
DATADOG_API_KEY
```

**Flutter app (per-environment, stored in CI secrets, injected at build time via --dart-define):**
```
API_BASE_URL                    — e.g. https://api.sovereigncut.com/api/v1
GOOGLE_MAPS_API_KEY_IOS
GOOGLE_MAPS_API_KEY_ANDROID
STRIPE_PUBLISHABLE_KEY
FIREBASE_PROJECT_ID
SENTRY_DSN_IOS
SENTRY_DSN_ANDROID
ENVIRONMENT                     — dev | staging | prod
```

---

## SECTION 19 — ACT PORTABLE LONG SERVICE LEAVE COMPLIANCE

From July 1, 2026, the Long Service Leave (Portable Schemes) Act 2009 applies to the hair industry in the ACT. Implement the following in the backend before go-live in Canberra:

- Track service days per worker across all employers within the platform
- Calculate and display the 1.07% quarterly levy for all eligible workers (those with employment relationships, not true contractors)
- Generate a quarterly levy report per studio that can be exported as PDF
- Store `service_days_recorded` on the `barber_profiles` table
- Apprentices (Level 1-2) are levy-exempt but still require service day tracking for the 6.06-week entitlement
- Add a "Compliance" tab in the Studio portal showing the current levy estimate and export button

---

## SECTION 20 — THIRD-PARTY API SUMMARY TABLE

| Service | Purpose | Auth Method | Docs URL |
|---|---|---|---|
| Google Maps Platform | Map display, geocoding, places | API key (restricted by bundle ID) | developers.google.com/maps |
| Google Sign-In | OAuth login | OAuth 2.0 | developers.google.com/identity |
| Apple Sign In | OAuth login (iOS mandatory) | JWT / Apple Keys | developer.apple.com/sign-in-with-apple |
| Twilio SMS | OTP delivery | Account SID + Auth Token | twilio.com/docs/sms |
| Stripe Connect | Payments, payouts, splits | Secret key + Webhooks | stripe.com/docs/connect |
| Firebase Cloud Messaging | Push notifications (iOS + Android) | Service account JSON | firebase.google.com/docs/cloud-messaging |
| Firebase Dynamic Links (or app_links) | Deep linking | Project config | firebase.google.com/docs/dynamic-links |
| Instagram Graph API | Portfolio sync, auto-post | OAuth 2.0 user token | developers.facebook.com/docs/instagram-api |
| TikTok API | Video upload, auto-post | OAuth 2.0 user token | developers.tiktok.com |
| DocuSign eSign | Legal doc generation and signing | OAuth 2.0 JWT Grant | developers.docusign.com |
| Banuba Video Editor SDK | In-app video editing | License key | docs.banuba.com |
| AWS S3 | File storage | IAM role (Lambda execution role) | docs.aws.amazon.com/s3 |
| AWS CloudFront | CDN for media | Linked to S3 | docs.aws.amazon.com/cloudfront |
| AWS SNS (optional) | Backup SMS delivery | IAM | docs.aws.amazon.com/sns |
| Sentry | Error tracking | DSN string | docs.sentry.io |
| Datadog | APM, logs, metrics | API key | docs.datadoghq.com |

---

## SECTION 21 — DEVELOPMENT STANDARDS AND NON-NEGOTIABLES

1. All backend endpoints must have a corresponding Jest unit test before merging. No exceptions.
2. All Flutter widgets with business logic must have widget tests. Pure UI widgets need golden file tests.
3. The Prisma schema is the source of truth for the database. No manual schema changes in production.
4. All database changes are applied via `prisma migrate deploy` in the CI/CD pipeline. Migrations are never run manually.
5. No raw SQL strings outside of designated repository files. All queries through Prisma unless PostGIS geo functions are required, in which case use `prisma.$queryRaw` with parameterized inputs only.
6. All API errors follow this response format exactly:
```json
{
  "success": false,
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "The requested booking does not exist or you do not have permission to view it.",
    "details": {}
  }
}
```
7. All successful API responses follow this format:
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 143 }
}
```
8. The `meta` field is only included on paginated responses.
9. All times are stored in UTC and formatted as ISO 8601 strings. Time zone conversion is the client's responsibility.
10. Monetary values are always in cents (integers) in the API. The client formats them for display. Never pass floats for money.
11. Every endpoint that modifies data must be idempotent where possible, or protected by a client-generated idempotency key via `Idempotency-Key` header (required on booking creation and payment endpoints).
12. The admin panel is server-rendered (Next.js or similar) and deployed separately from the mobile backend. It is never embedded in the mobile app.
13. A working local development environment must be documented in a `DEVELOPMENT.md` file. Any engineer should be able to run `make dev` and have a working local stack in under 10 minutes.

---

*End of TAPR Master Development and Deployment Prompt — Version 1.0*