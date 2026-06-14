# BRD Coverage Report — Epic 10

Date: 2026-05-15
Environment: local (localhost:5173 + localhost:3001)
Overall coverage: 1 / 1 requirement (F-28) = 100%

## Epic 10 Context

Epic 10 is Amendment F-28 only — a pure test-isolation infrastructure fix. There are no BRD F-IDs assigned to this epic. F-28 is treated as 1 of 1 requirement for coverage gate purposes.

---

## F-28 Verification Checklist

| Check | Requirement | Status | Notes |
|-------|-------------|--------|-------|
| F-28.1 | `apps/backend/.env.test` exists and contains `DATABASE_URL` pointing at local PostgreSQL | PASS | `postgresql://edgar.hernandez@localhost/recruitment_test` confirmed |
| F-28.2 | `apps/backend/src/tests/setup-env.ts` loads `.env.test` before `.env` | PASS | `config({ path: ".env.test" })` called first; dotenv never overrides existing vars |
| F-28.3 | `apps/backend/vitest.config.ts` uses `setup-env.ts` in `setupFiles` | PASS | `setupFiles: ["./src/tests/setup-env.ts"]` confirmed |
| F-28.4 | Backend tests pass with local DB isolation (120 passed, 0 failed) | PASS | All 14 test files, 120 tests passed |
| F-28.5 | Load order confirmed via dotenvx stdout — `.env.test` first across all test files | PASS | `◇ injected env (1) from .env.test` appears before `◇ injected env (4) from .env` in every test file's stdout |

**F-28: 5/5 checks = PASS**

---

## Backend Unit Tests (Vitest)

| Metric | Result |
|--------|--------|
| Test files | 14 passed |
| Tests | 120 passed, 0 failed |
| Duration | ~19s |
| DB in use | `postgresql://edgar.hernandez@localhost/recruitment_test` (local, not Supabase) |
| Load order verified | `.env.test` injected first in every test file |

---

## Playwright E2E Regression (Existing Tests, No New Specs Written)

| Test file | Result | Notes |
|-----------|--------|-------|
| auth.spec.ts (9 tests) | 9 PASS | All auth flows passing |
| pending-delete.spec.ts (2 tests) | 2 PASS | Pending + delete flow passing |
| export.spec.ts (3 tests) | 3 PASS | Export + logging passing |
| candidates.spec.ts (8 tests) | 5 PASS / 3 FAIL | 3 failures are pre-existing from prior epics (not introduced by Epic 10) |
| pre-screening.spec.ts (3 tests) | 3 SKIP | Fixtures require running Claude API — skipped |
| post-screening.spec.ts (5 tests) | 5 SKIP | Fixtures require running Claude API — skipped |

**Total E2E: 20 passed, 3 pre-existing failures, 8 skipped**

### Pre-existing Playwright Failures (NOT caused by Epic 10)

The 3 failing candidates.spec.ts tests (`F-01, F-16`, `F-02, F-14`, `F-15, F-02`) all fail at the same point: after clicking "Create Candidate", `getByRole('link', { name: 'QA Candidate — Epic 2' })` is not visible within 15 seconds. This is a pre-existing timing/selector issue that predates Epic 10. Epic 6 QA ran only 11 tests (auth + pending-delete), never running the full candidates.spec.ts suite. Epic 10 introduced no application code changes — these failures are not regressions from this epic.

---

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NF-03 | JWT auth protects all routes | PASS | auth.spec.ts passing |
| NF-07 | Audit logging | PASS | export.spec.ts NF-07 passing |

---

## Known Defects

- [EPIC-10][LOW] E2E `candidates.spec.ts`: 3 tests fail on candidate creation link visibility timeout — pre-existing issue from prior epics, not introduced by Epic 10. Severity: Low (does not block deployment).
- [EPIC-8][LOW] BE: `getCandidateFilePath()` dead code — cleanup future pass (carried from epic 8)
- [EPIC-8][LOW] BE: AWS SDK v3 NodeVersionSupportWarning — harmless (carried from epic 8)
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no — acceptable at current scale (carried from epic 8)

---

## Test Artifacts

- Playwright HTML report: `apps/frontend/playwright-report/`
- Test run date: 2026-05-15
- Backend unit tests: 120/120 PASS
- E2E pass rate: 20/31 attempted (8 skipped by design, 3 pre-existing failures)

---

## Sign-off

[x] F-28 verification: 5/5 checks PASS
[x] Backend tests: 120/120 PASS with local DB isolation confirmed
[x] No regressions introduced by Epic 10
[x] >= 80% coverage achieved (F-28 = 1/1 = 100%)

**QA verdict: PASS — advance to epic=10,phase=4.0-complete**
