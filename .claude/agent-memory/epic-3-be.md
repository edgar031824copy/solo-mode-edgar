---
epic: 3
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/services/screening.service.ts, apps/backend/src/tests/screening.test.ts, apps/backend/src/routes/candidates.ts, apps/backend/src/controllers/candidates.controller.ts, apps/frontend/src/lib/api.ts]
---

Date: 2026-05-10
Epic: 3
Phase: 2.0-complete

## Routes Implemented
POST /candidates/:id/pre-screen — preScreenCandidateHandler (calls runPreScreening; upserts PreScreening; advances status)

## Database Models
No schema changes. All models defined in Epic 2 migration. PreScreening upserted via Prisma transaction.

## Migrations
None — Epic 2 migration already contains all required fields.

## Test Results
Integration: 30 passed, 0 failed (4 test files; sequential via maxWorkers=1)
- screening.test.ts: 7 new tests (404, 400, 200×2, upsert, 502, service unit)
- candidates.test.ts: 14 existing tests — all still pass
- auth.test.ts: 9 existing tests — all still pass
- health.test.ts: 1 existing test — pass

## Env Vars Required
ANTHROPIC_API_KEY (present since Epic 1 scaffold), DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN

## Key Implementation Notes
- screening.service.ts: runPreScreening(candidateId) — fetches candidate, reads files, calls claude-sonnet-4-6, upserts PreScreening + sets status=pre_screened in single Prisma $transaction
- Anthropic mock in tests uses named function constructor (not arrow) to avoid Vitest class-mock warning
- mockMessagesCreate shared variable lets 502 test override response without re-mocking the entire module
- vitest.config.ts maxWorkers=1 added to prevent parallel test files from racing on shared DB state
- stripJsonFences() helper strips ```json ``` fences before JSON.parse; auto-retry on parse failure
- FE fix applied: apps/frontend/src/lib/api.ts 401 interceptor now excludes /auth/login path so login error alert renders correctly ([EPIC-2][MEDIUM])

## What FE Agent Needs
- POST /candidates/:id/pre-screen — no request body needed; returns PreScreening record shape:
  { id, candidateId, profileSummary, redFlagsJson, interviewQuestionsJson, overallFit, createdAt, updatedAt }
- redFlagsJson and interviewQuestionsJson are raw JSON strings — parse client-side with JSON.parse()
- After successful call, candidate.status becomes "pre_screened" — trigger parent re-fetch
- 400 if candidate has no files; 404 if candidate not found; 502 on Anthropic failure

## Deviations from design.md
- vitest.config.ts: added maxWorkers=1 — not in design spec; required to prevent parallel test file DB races
- Anthropic mock uses named function constructor instead of vi.fn().mockImplementation() — Vitest 4 class mock requirement
