# Review Report — Epic 7
Date: 2026-05-14
Phase: 3.0-complete

## Summary
Epic 7 scope: Amendment F-25 — fix 42 CI test failures caused by `getAuthToken()` helpers requiring a seeded DB row absent in CI. Backend-only change (test infrastructure). No production code modified.

Issues found: 0 new issues.
Issues fixed: 1 prior [HIGH] issue (EPIC-6 CI 401 failures) — fully resolved.

---

## Prior Issue Fixes

### [EPIC-6][HIGH] — CI: Backend tests fail with 401 on all protected routes

Root cause confirmed: `getAuthToken()` in all four affected test files called `POST /auth/login`, which requires a seeded recruiter row. CI runs `prisma migrate deploy` but no seed step.

Fix implemented by BE agent:
- Created `apps/backend/src/tests/helpers/auth.ts` — exports `makeAuthToken()` (synchronous, calls `generateToken()` directly from `auth.service.ts`, no DB round-trip) and `makeAuthHeader()`.
- Replaced all `getAuthToken()` / `await getAuthToken()` call sites in `candidates.test.ts` (15 sites), `screening.test.ts` (7 sites), `postScreening.test.ts` (13 sites), `report.test.ts` (6 sites).
- `makeAuthToken()` is synchronous — all `await` calls removed correctly.
- `TEST_RECRUITER.sub` is `"00000000-0000-0000-0000-000000000001"` — valid UUID v4 format.
- Tests that assert `401` for unauthenticated requests are untouched and still pass.

Verification: 120 BE tests pass with `JWT_SECRET=ci-test-secret-not-real` (same value as CI workflow).

---

## Static Review

### Auth Helper Implementation
- `makeAuthToken()` calls `generateToken()` from `../../services/auth.service.js` — correct import, same function the production login route uses.
- Reads `JWT_SECRET` from `process.env` at call time — throws descriptive error if unset; will surface immediately in CI if the env var is ever dropped from the workflow.
- No hardcoded secrets.
- `TEST_RECRUITER.sub` is `"00000000-0000-0000-0000-000000000001"` — valid UUID.

### Production File Integrity
Working tree diff confirms only these files changed since last commit:
- `apps/backend/src/tests/candidates.test.ts` — test-only
- `apps/backend/src/tests/postScreening.test.ts` — test-only
- `apps/backend/src/tests/report.test.ts` — test-only
- `apps/backend/src/tests/screening.test.ts` — test-only
- `apps/backend/src/tests/helpers/auth.ts` — new test helper (untracked)
- `docs/.phase` — phase state
- `amendments.md` — F-25 status updated to done
- `.claude/agent-memory/epic-7-*.md` — agent memory files

No changes to: `src/routes/`, `src/controllers/`, `src/services/`, `src/middleware/`, `.github/workflows/`, `prisma/`.

### No-await Verification
`grep -n "await.*makeAuthToken"` returns 0 matches across all four test files — synchronous usage confirmed correct.

---

## API Contract Conformance
No new endpoints in Epic 7. All endpoints from prior epics unchanged and tested.

---

## Test Results

### Backend (Vitest)
```
Test Files: 14 passed (14)
Tests:      120 passed (120)
Duration:   90.6s
```
Run command: `JWT_SECRET=ci-test-secret-not-real AWS_UPLOADS_BUCKET=test-bucket AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=test-key-id AWS_SECRET_ACCESS_KEY=test-secret-key ANTHROPIC_API_KEY=test-anthropic-key npm test -- --run`

### Frontend (Vitest)
```
Test Files: 11 passed (11)
Tests:      54 passed (54)
Duration:   5.3s
```

### Combined
Total: 174 passed, 0 failed across 25 test files.

---

## BRD Functional Coverage

Epic 7 implements Amendment F-25 (not a BRD F-ID). No BRD functional requirements are added or changed in this epic. All prior F-01 through F-24 requirements remain implemented as verified in prior epic review reports.

| Amendment | Description | Status |
|-----------|-------------|--------|
| F-25 | Fix 42 CI test failures (BE test infra) | PASS |

---

## Known Limitations / Deferred Items

- [LOW] `getCandidateFilePath()` in `candidates.service.ts` returns a `filePath` field (disk path) that the controller never reads — only `result.fileName` (S3 key) is consumed. The function itself is actively called; only the `filePath` property is dead. Non-blocking, carry-forward to Epic 8 if scope permits.
- [LOW] AWS SDK v3 emits `NodeVersionSupportWarning` for Node < 22. Harmless; production Lightsail targets Node 22 LTS.
