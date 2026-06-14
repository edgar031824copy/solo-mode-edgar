---
epic: 10
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/.env.test, apps/backend/src/tests/setup-env.ts, apps/backend/vitest.config.ts]
---

Date: 2026-05-15
Epic: 10
Phase: 2.0-complete

## Routes Implemented
None — F-28 is a test isolation fix only. No API changes.

## Database Models
None — no schema changes.

## Migrations
None — no new migrations.

## Changes Made

### apps/backend/.env.test (new file — safe to commit)
Contains DATABASE_URL pointing at local PostgreSQL test DB.
Note: uses `postgresql://edgar.hernandez@localhost/recruitment_test` on this machine
because bare `postgresql://localhost/recruitment_test` causes Prisma CLI P1010 access denied.
CI is unaffected — its DATABASE_URL is injected via env: before dotenv runs.

### apps/backend/src/tests/setup-env.ts (new file)
Loads `.env.test` first (sets DATABASE_URL=local test DB), then loads `.env`
(fills JWT_SECRET, ANTHROPIC_API_KEY, etc.). Dotenv's no-override guarantee means
the Supabase URL in `.env` is never applied when the test URL is already set.

### apps/backend/vitest.config.ts (modified)
Replaced `setupFiles: ["dotenv/config"]` with `setupFiles: ["./src/tests/setup-env.ts"]`.

## Local Test DB Setup (run once from apps/backend/)
```
createdb recruitment_test 2>/dev/null || true
DATABASE_URL=postgresql://edgar.hernandez@localhost/recruitment_test npx prisma migrate deploy
DATABASE_URL=postgresql://edgar.hernandez@localhost/recruitment_test npx tsx prisma/seed.ts
```

## Test Results
Integration: 120 passed, 0 failed (14 files)
Tests confirmed running against local `recruitment_test` DB — dotenv logs show
"injected env (1) from .env.test" before "injected env (4) from .env".

## Env Vars Required
DATABASE_URL (from .env.test for test runs), JWT_SECRET, ANTHROPIC_API_KEY (from .env)

## Deviations from design.md
.env.test uses `postgresql://edgar.hernandez@localhost/recruitment_test` instead of the
generic `postgresql://localhost/recruitment_test` specified in design-epic-10.md. Reason:
bare localhost URL causes Prisma CLI P1010 on this machine; pg driver and PrismaPg adapter
work fine with it but `prisma migrate deploy` does not. CI is unaffected (DATABASE_URL
already set in environment before dotenv executes).
