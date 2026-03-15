# TAPR — Local Development Guide

## Prerequisites

- **Node.js 20+** — Backend runtime
- **Flutter 3.x** — Mobile app (use `flutter --version` to check)
- **Docker Desktop** — For PostgreSQL, PostGIS, and Redis
- **Git** — Version control

---

## Quick Start (from scratch)

### 1. Clone and install

```bash
git clone <repo-url> tapr && cd tapr
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 15 + PostGIS** on port 5432
- **Redis** on port 6379

### 3. Backend setup

```bash
cd apps/backend
cp .env.example .env
# Edit .env with your values (see Environment Variables below)
npm ci
npx prisma migrate dev
npm run dev
```

The API runs at `http://localhost:3000`.

### 4. Mobile setup

```bash
cd apps/mobile
flutter pub get
# Configure Firebase (optional for push): dart run flutterfire configure
flutter run
```

For local API, use:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=ENVIRONMENT=development --dart-define=SENTRY_DSN=
```

---

## Docker Compose (Development)

The root `docker-compose.yml` provides:

| Service   | Image                    | Port | Purpose                    |
|-----------|--------------------------|------|----------------------------|
| postgres  | postgis/postgis:15-3.3   | 5432 | PostgreSQL + PostGIS       |
| redis     | redis:7-alpine           | 6379 | Caching, sessions, queues  |

Default credentials:
- Postgres: `tapr` / `tapr_dev` / database `tapr`
- Redis: no auth (localhost only)

---

## Environment Variables

Copy `apps/backend/.env.example` to `apps/backend/.env`. All variable names are listed there; use placeholder or real values as needed.

### Required for backend startup

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` — 32+ character secret for JWT signing
- `STRIPE_SECRET_KEY` — Stripe API key (use `sk_test_...` for dev)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret

### Optional

- `REDIS_URL` — Defaults to `redis://localhost:6379`
- `TWILIO_*` — For OTP SMS (leave empty to skip SMS)
- `GOOGLE_CLIENT_ID` — For Google Sign-In validation
- `AWS_*`, `DOCUSIGN_*`, `FIREBASE_*` — For specific features

---

## Running the Backend

```bash
cd apps/backend
npm run dev
```

Uses `ts-node-dev` with hot reload. API at `http://localhost:3000`.

---

## Running the Flutter App

```bash
cd apps/mobile
flutter run
```

### Dart define flags

| Flag           | Default                    | Description                          |
|----------------|----------------------------|--------------------------------------|
| API_BASE_URL   | https://api.tapr.com.au/api/v1 | Backend API base URL              |
| ENVIRONMENT    | development                | Sentry environment tag               |
| SENTRY_DSN     | (empty)                    | Sentry DSN for error tracking        |

Example for local backend:

```bash
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=ENVIRONMENT=development
```

---

## Running Tests

### Backend

```bash
cd apps/backend
npm test
```

Runs all unit tests. Requires `DATABASE_URL` (use test DB or same as dev; Jest setup provides defaults).

**Integration tests** (need Docker):

```bash
npm run test:integration
```

Starts Postgres on port 5433, runs migrations, executes integration tests, then stops the container.

### Flutter

```bash
cd apps/mobile
flutter test
```

With coverage:

```bash
flutter test --coverage
```

---

## Resetting the Database

```bash
cd apps/backend
npx prisma migrate reset
```

Drops all data, reapplies migrations, and runs the seed script (if configured).

---

## Common Troubleshooting

### PostGIS extension not found

**Error:** `Could not find the PostGIS extension`

**Fix:** Ensure you use the PostGIS image (`postgis/postgis:15-3.3`), not plain PostgreSQL. The schema uses `extensions = [postgis, pgcrypto]`.

### Redis connection refused

**Error:** `ECONNREFUSED 127.0.0.1:6379`

**Fix:**
1. Start Redis: `docker compose up -d redis` (or `redis-server` if installed locally)
2. Check `REDIS_URL` in `.env` (default `redis://localhost:6379`)

### Prisma migrate fails

**Error:** `Can't reach database server`

**Fix:**
1. Ensure Docker is running: `docker compose ps`
2. Wait for Postgres to be ready: `docker compose up -d && sleep 3`
3. Verify `DATABASE_URL` matches docker-compose credentials

### Flutter analyze fails

**Fix:** Run `flutter pub get` and address any reported issues. Use `flutter analyze --fatal-infos` to match CI.

### Port already in use

**Fix:** Change ports in `docker-compose.yml` or stop the conflicting process. Backend port is set via `PORT` env var (default 3000).

---

## Git Workflow

### Branch naming

- `feature/<short-description>` — New features
- `hotfix/<short-description>` — Production fixes
- `develop` — Integration branch (PRs target here first)
- `staging` — Pre-production
- `main` — Production only

### PR process

1. Create a branch from `develop`
2. Make changes, run `npm test` and `flutter test`
3. Open a PR into `develop`
4. Ensure CI passes (lint, tests, Flutter analyze)
5. Merge after review

### Commit messages

- `feat: add X`
- `fix: resolve Y`
- `chore: update Z`
- `test: add tests for X`
