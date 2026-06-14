# Design — Epic 10

Amendment: F-28
Status: pending → in-progress
Author: Architect Agent
Date: 2026-05-15

## Scope

Epic 10 contains a single amendment: **F-28 — Fix test isolation so vitest uses a local PostgreSQL
database instead of the shared Supabase production database.**

No API endpoints, database schema, FE components, or infrastructure are changed.

---

## § Test Isolation Fix

### Root Cause

`apps/backend/vitest.config.ts` lists `"dotenv/config"` in `setupFiles`. `dotenv/config` loads
`apps/backend/.env`, which contains `DATABASE_URL` pointing at the live Supabase instance.
`afterEach` hooks in four test files call `prisma.candidate.deleteMany()` — this deletes all
candidates from production on every local `npm test` run.

CI is already safe: GitHub Actions injects `DATABASE_URL` via `env:` in the workflow before
`npm test` runs. Because `dotenv` never overrides variables already present in `process.env`,
CI always uses its own ephemeral test DB (provisioned by the `services:` block in ci.yml).

### Three-file Fix

#### 1. `apps/backend/.env.test` (new file — safe to commit)

```
DATABASE_URL=postgresql://localhost/recruitment_test
```

Contains no secrets. Points vitest at a local PostgreSQL database that is created and migrated
before any test run. Safe to commit to the repository.

#### 2. `apps/backend/src/tests/setup-env.ts` (new file)

```ts
import { config } from "dotenv";

// Load the test DB URL first so it takes precedence over .env
config({ path: ".env.test" });

// Load the rest of .env (JWT_SECRET, ANTHROPIC_API_KEY, etc.)
// dotenv never overrides vars already set — DATABASE_URL from .env is ignored
config();
```

Load order guarantee:
- `.env.test` sets `DATABASE_URL=postgresql://localhost/recruitment_test`
- `.env` fills remaining vars (`JWT_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, etc.)
- `.env`'s `DATABASE_URL` (Supabase) is silently skipped — already set

#### 3. `apps/backend/vitest.config.ts` (modify)

Replace:

```ts
setupFiles: ["dotenv/config"],
```

With:

```ts
setupFiles: ["./src/tests/setup-env.ts"],
```

No other changes to `vitest.config.ts`.

### Local Test DB Prerequisite

Before running `npm test` locally the test database must exist and migrations must be applied.
Run this once (idempotent — safe to re-run):

```bash
createdb recruitment_test 2>/dev/null || true
DATABASE_URL=postgresql://localhost/recruitment_test npx prisma migrate deploy
```

Both commands must be run from `apps/backend/`.

The Developer BE agent must run this prerequisite before executing `npm test` as part of the
F-28 implementation verification step.

### CI — No Changes Required

`.github/workflows/ci.yml` and `.github/workflows/deploy.yml` are unchanged. The CI workflow
already sets `DATABASE_URL` in `env:` at the job level, so `dotenv`'s `config()` call is a
no-op for that variable in CI. The new `setup-env.ts` file behaves identically to the old
`dotenv/config` entry in CI because `process.env.DATABASE_URL` is already set before
`config({ path: ".env.test" })` executes.

### Agent Definition Updates

Two agent definition files require a prerequisite step added:

#### `04-techlead-agent.md` — Step 3 (Run backend tests)

Replace the existing `cd apps/backend && npm run test -- --run` block with:

```bash
# Ensure local test DB exists and is migrated before running vitest
cd apps/backend && createdb recruitment_test 2>/dev/null || true
DATABASE_URL=postgresql://localhost/recruitment_test npx prisma migrate deploy
npm run test -- --run
```

#### `05-qa-agent.md` — Step 2 (Start servers locally)

Add before the `cd apps/backend && npx prisma db seed` line:

```bash
# Ensure local test DB exists and is migrated (required by setup-env.ts)
cd apps/backend && createdb recruitment_test 2>/dev/null || true && \
  DATABASE_URL=postgresql://localhost/recruitment_test npx prisma migrate deploy
```

### Files Changed by This Epic

| File | Action | Reason |
|------|--------|--------|
| `apps/backend/.env.test` | Create | Stores `DATABASE_URL` pointing at local test DB — safe to commit |
| `apps/backend/src/tests/setup-env.ts` | Create | Loads `.env.test` first, then `.env`, preventing production DB URL override |
| `apps/backend/vitest.config.ts` | Modify | Replace `setupFiles: ["dotenv/config"]` with `setupFiles: ["./src/tests/setup-env.ts"]` |
| `.claude/agents/04-techlead-agent.md` | Modify | Add local test DB prerequisite to Step 3 |
| `.claude/agents/05-qa-agent.md` | Modify | Add local test DB prerequisite to Step 2 |

### Verification

After implementing all three file changes, run:

```bash
cd apps/backend
createdb recruitment_test 2>/dev/null || true
DATABASE_URL=postgresql://localhost/recruitment_test npx prisma migrate deploy
npm run test -- --run
```

All tests must pass. The Supabase production database must show no change in its candidate count
before and after the test run (confirming `deleteMany()` no longer hits production).
