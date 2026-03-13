# TAPR — Claude Code Project Brief

## What This Is
A three-sided mobile marketplace for the barbering industry. Three user types:
1. Consumers (book barbers)
2. Barbers (manage career, bookings, portfolio, legal agreements)
3. Studios (rent chairs, scout talent, host events)

## Monorepo Structure
- apps/mobile — Flutter 3.x app (Dart), single codebase for iOS and Android
- apps/backend — Node.js 20 with Express, TypeScript strict mode, Prisma ORM
- apps/admin — Next.js admin panel (not started yet)
- infrastructure/ — Terraform for all AWS resources

## Tech Decisions (Do Not Change Without Asking)
- State management: Riverpod 2.x (not Bloc, not Provider)
- Navigation: Go Router
- ORM: Prisma only. No raw SQL except PostGIS geo queries via prisma.$queryRaw
- All monetary values in cents (integers). Never floats for money.
- All times in UTC. ISO 8601 strings in the API.
- API errors always use the standard error format (see apps/backend/src/types/api.ts)

## Branch Strategy
- main: production only, tagged releases
- staging: pre-prod, auto-deploys
- develop: integration, PRs go here first
- feature/*, hotfix/*: short-lived branches

## Code Standards
- Backend: ESLint strict, no warnings in production, 100% test pass rate before merge
- Flutter: flutter analyze --fatal-infos must pass clean
- All backend endpoints need a Jest test before merging
- No console.log in production code. Use the logger utility at src/utils/logger.ts

## Key Domain Rules
- Barbers have levels 1-6. Level-up logic runs as a BullMQ scheduled job at 2am AEST
- Barbers can never go DOWN a level once achieved
- Level 3+ required for Sick Call Hero. Level 5+ required for Partnership Builder.
- Chair listings charge studios a $5/day listing fee via Stripe at creation time
- Booking escrow releases on completion. Disputes freeze escrow until admin resolves.

## Environment
- Never hardcode credentials. All secrets via AWS Secrets Manager in production.
- Local dev uses .env files (never committed).
- See DEVELOPMENT.md for local setup steps.

## When in Doubt
Ask before making architectural decisions. Prefer the simplest solution that fits
the existing patterns. If something seems wrong with the spec, say so explicitly
rather than quietly doing it a different way.

Routine 
Morning (Sessions 1-4):
- Core backend or Flutter work
- Write tests immediately after building each feature
- Commit after each session

Afternoon (Sessions 5-8):
- Continue feature work
- Run full test suite mid-afternoon: npm test && flutter test
- Fix any regressions before adding new code

Evening (Sessions 9-10):
- Review and clean up the day's work
- Push to develop branch
- Check GitHub Actions pass
- Plan tomorrow's sessions

Daily commit rule:
Never end a day without a passing test suite.
If tests are failing, fix them before closing the laptop.