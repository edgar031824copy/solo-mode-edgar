---
epic: 7
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/tests/helpers/auth.ts, apps/backend/src/tests/candidates.test.ts, apps/backend/src/tests/screening.test.ts, apps/backend/src/tests/postScreening.test.ts, apps/backend/src/tests/report.test.ts]
---

Date: 2026-05-14
Epic: 7
Phase: 2.0-complete

## Summary
Fixed 42 CI test failures caused by `getAuthToken()` helpers requiring a seeded DB row absent in CI.
Replaced all `async function getAuthToken()` blocks with a shared synchronous helper that generates
JWTs directly via `generateToken()` — no DB round-trip required.

## Routes Implemented
None — test infrastructure fix only. No production routes modified.

## Database Models
None — no schema changes.

## Migrations
None — no schema changes.

## Files Changed
- apps/backend/src/tests/helpers/auth.ts — CREATED: `makeAuthToken()` and `makeAuthHeader()` exports
- apps/backend/src/tests/candidates.test.ts — removed `getAuthToken()`, replaced ~15 call sites
- apps/backend/src/tests/screening.test.ts — removed `getAuthToken()`, replaced ~10 call sites
- apps/backend/src/tests/postScreening.test.ts — removed `getAuthToken()`, replaced ~17 call sites
- apps/backend/src/tests/report.test.ts — removed `getAuthToken()`, replaced ~7 call sites
- amendments.md — F-25 status updated from pending to done

## Test Results
Integration: 120 passed, 0 failed (14 files)
Tests that assert 401 for unauthenticated requests remain intact and continue to pass.

## Env Vars Required
JWT_SECRET — already present in .github/workflows/ci.yml as `ci-test-secret-not-real`

## Deviations from design.md
None
