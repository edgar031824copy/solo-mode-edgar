---
epic: 7
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-7.md]
---

Date: 2026-05-14
Phase: 1.0-complete

## Summary
Epic 7 is a backend test infrastructure fix only. No production code changes, no schema changes, no FE changes.
Amendment F-25: fix 42 CI test failures caused by `getAuthToken()` helpers that depend on a seeded DB row absent in CI.

## Root Cause
`getAuthToken()` in candidates/screening/postScreening/report test files calls `POST /auth/login`.
CI runs `prisma migrate deploy` but no seed step — recruiter row does not exist — login returns 401 —
`res.body.token` is undefined — every protected-route request fails with 401.

## Fix
Create `apps/backend/src/tests/helpers/auth.ts` with two exports:
- `makeAuthToken(): string` — calls `generateToken()` directly with `JWT_SECRET` env var; no DB needed
- `makeAuthHeader(): string` — convenience wrapper returning `"Bearer <token>"`

Replace all `async function getAuthToken()` blocks and their `await getAuthToken()` call sites
in the four affected test files. `makeAuthToken()` is synchronous — drop `await` at every call site.

## Affected Test Files
- apps/backend/src/tests/candidates.test.ts — UPDATE
- apps/backend/src/tests/screening.test.ts — UPDATE
- apps/backend/src/tests/postScreening.test.ts — UPDATE
- apps/backend/src/tests/report.test.ts — UPDATE
- apps/backend/src/tests/helpers/auth.ts — CREATE

## Not Affected
- health.test.ts (no auth needed), auth.test.ts (tests login itself, not failing)
- fileParser.test.ts (no HTTP), any production source file, ci.yml, schema

## CI Environment
JWT_SECRET is already set in .github/workflows/ci.yml as `ci-test-secret-not-real`.
No new GitHub Actions secrets or workflow changes required.

## API Endpoints
None — no new or changed endpoints.

## Database Models
None — no schema changes.

## Anthropic Call Points
None — no Anthropic changes.

## Infrastructure
No infrastructure changes. All CI/CD from Epic 6 unchanged.

## Required Env Vars
JWT_SECRET — already present in ci.yml

## Deviations from BRD
F-25 is an amendments.md item (no BRD row). No BRD deviations.
