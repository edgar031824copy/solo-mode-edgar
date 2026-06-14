# Review Report — Epic 16

**Date:** 2026-05-24
**Phase:** 3.0-complete
**Amendment:** F-34 — S3 credential env var name mismatch fix

---

## Summary

Epic 16 is a single-file BE-only fix. One line of `s3.service.ts` replaced; `.env.example` updated; one new unit test added.

- Issues found: 0 new issues
- Issues fixed from prior epics: 0 (only prior HIGH/MEDIUM was terraform.tfvars git tracking — an infrastructure remediation not addressable in a code-only epic; carried forward)

---

## Prior Issue Fixes

None — no prior `[HIGH]` or `[MEDIUM]` issues were addressable in this BE-only code epic. The `[EPIC-13][MEDIUM]` terraform.tfvars item requires `git rm --cached` and history scrub, not code changes. Carried forward unchanged.

---

## API Contract Conformance

No new or changed endpoints in this epic. All existing endpoints remain identical. The fix is internal to the S3 service layer — callers (`POST /candidates`, `GET /candidates/:id/files/:fileType`) are unaffected.

| Endpoint | Status |
|----------|--------|
| All pre-existing endpoints | PASS (no changes made) |

---

## Code Review Findings

### apps/backend/src/services/s3.service.ts

PASS — `S3Client` constructor now includes an explicit `credentials` block:

```ts
credentials: {
  accessKeyId: process.env.BACKEND_S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.BACKEND_S3_SECRET_ACCESS_KEY ?? "",
},
```

This matches the spec in `docs/design-epic-16.md § Required Code Change` exactly. The comment explaining the deploy.yml naming convention is present. No other lines were modified.

### apps/backend/src/tests/s3.service.test.ts

PASS — Test file created. Uses `vi.mock("@aws-sdk/client-s3")` with a constructor spy. Calls `vi.resetModules()` + dynamic re-import in `beforeEach` so fresh env vars are picked up on each test. Asserts `S3Client` was called with `expect.objectContaining({ region, credentials: { accessKeyId, secretAccessKey } })`. Pattern conforms to existing test style.

### apps/backend/.env.example

PASS — `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` replaced with `BACKEND_S3_ACCESS_KEY_ID` / `BACKEND_S3_SECRET_ACCESS_KEY`. Comment added explaining the naming convention and why the SDK default chain cannot resolve these names.

### Security

PASS — No secrets in source. No hardcoded credentials. Empty-string fallbacks (`?? ""`) are acceptable — failure mode is AccessDenied at upload time, identical to the pre-fix behavior when env vars are missing.

### TypeScript / Code Quality

PASS — No `any` types introduced. No unused imports. No dead code added.

---

## Test Results

| Suite | Files | Tests | Passed | Failed |
|-------|-------|-------|--------|--------|
| Backend (Vitest) | 16 | 134 | 134 | 0 |
| Frontend (Vitest) | — | — | — | — |

Frontend: no FE changes in this epic. Last confirmed FE run: 58 passed, 0 failed (Epic 14).

**Backend total: 134 passed, 0 failed.**

The 1 new test (`s3.service.test.ts`) passes. All 133 pre-existing tests continue to pass.

---

## BRD Functional Coverage

F-34 is an `amendments.md` amendment, not in BRD § 5.3 F-01..F-23. No BRD functional requirement changes in this epic. All prior BRD coverage remains intact.

---

## Known Limitations / Deferred Items

- `[EPIC-13][MEDIUM]` INFRA: terraform.tfvars still tracked in git — carried forward, not addressable in code-only epics.
- `[EPIC-8][LOW]` BE: `getCandidateFilePath()` dead code — carried forward.
- `[EPIC-8][LOW]` BE: AWS SDK v3 NodeVersionSupportWarning — Node 20 on dev machine; Lightsail targets Node 22 LTS; harmless.
- `[EPIC-8][LOW]` CI: `StrictHostKeyChecking=no` — carried forward.
- `[EPIC-11][LOW]` FE: 3s polling interval hardcoded — carried forward.

---

## Sign-off

APPROVED — All 134 backend tests pass. Epic 16 change conforms exactly to `docs/design-epic-16.md`. No blockers.
