# BRD Coverage Report — Epic 7
Date: 2026-05-14
Environment: local (apps/backend only — no UI/server start required for this epic)
Overall coverage: 1 / 1 requirements (this epic's F-IDs) = 100%

## Functional Requirements

| ID   | Requirement summary                                                  | Status | Notes |
|------|----------------------------------------------------------------------|--------|-------|
| F-25 | Fix CI pipeline — backend tests pass with JWT auth headers in CI env | PASS   | All 120 BE tests pass with JWT_SECRET=ci-test-secret-not-real; zero getAuthToken() usages remain; no production files modified |

## Non-Functional Requirements

| ID    | Requirement summary                   | Status | Notes |
|-------|---------------------------------------|--------|-------|
| NF-03 | JWT auth — all protected routes auth  | PASS   | makeAuthToken()/makeAuthHeader() use generateToken() directly; no DB required |
| NF-07 | CI pipeline passes                    | PASS   | JWT_SECRET=ci-test-secret-not-real confirmed in .github/workflows/ci.yml line 55 |

## Acceptance Criteria Checklist

- [x] `apps/backend/src/tests/helpers/auth.ts` exists — exports `makeAuthToken()` and `makeAuthHeader()`
- [x] `makeAuthToken()` calls `generateToken()` from `../../services/auth.service.js` — no DB call
- [x] All 120 backend tests pass with `JWT_SECRET=ci-test-secret-not-real` (14 test files, 88s run)
- [x] Zero occurrences of `getAuthToken` in `apps/backend/src/tests/` — confirmed via grep (exit 1 = no matches)
- [x] No production source files modified in epic 7 — only test files changed
- [x] `.github/workflows/ci.yml` line 55 contains `JWT_SECRET: ci-test-secret-not-real`

## Known Defects

- [EPIC-7][LOW] `getCandidateFilePath()` in candidates.service.ts returns `filePath` property that is never consumed post-F-24 — only `result.fileName` (S3 key) is read by the controller. Dead property, not a runtime bug. Cleanup deferred.
- [EPIC-7][LOW] AWS SDK v3 emits NodeVersionSupportWarning for Node < 22. Harmless in production (Lightsail targets Node 22 LTS).

## Test Artifacts

- Backend vitest run: 120 passed, 0 failed (14 files)
- Run duration: 88.41s
- Test run date: 2026-05-14
- Playwright: not applicable — F-25 is a CI test infrastructure fix with no UI flows

## Sign-off

[x] >= 80% coverage achieved (100%: 1/1 F-IDs passed) — advancing to 4.0-complete
