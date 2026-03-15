# TAPR — Local Development

## Backend

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ with PostGIS
- Redis
- (Optional) Docker for integration tests

### Setup

1. Copy `apps/backend/.env.example` to `apps/backend/.env` and fill in values.
2. Run migrations: `cd apps/backend && npx prisma migrate dev`
3. Install deps: `npm ci`
4. Start dev server: `npm run dev`

### Tests

- **Unit tests:** `npm test` — runs all unit tests (integration tests skipped unless `TEST_DATABASE_URL` is set).
- **Integration tests:** `npm run test:integration` — starts a Postgres+PostGIS container on port 5433, runs migrations, executes integration tests, then stops the container.

For integration tests locally, ensure Docker is running. The script uses `docker-compose.test.yml` and sets `TEST_DATABASE_URL=postgresql://tapr_test:testpassword@localhost:5433/tapr_test`.

### Environment Variables

See `apps/backend/.env.example`. Key vars:

- `DATABASE_URL` — main DB for dev
- `TEST_DATABASE_URL` — used only when running integration tests (e.g. via `npm run test:integration` or in CI)
- `REDIS_URL` — defaults to `redis://localhost:6379`
- `JWT_ACCESS_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — required for app startup

## Mobile

See `apps/mobile/README.md`.
