# BRD Coverage Report — Epic 16
Date: 2026-05-24
Environment: local verification (unit tests, no server start required — BE-only change)
Overall coverage: 1 / 1 requirements (this epic's F-IDs) = 100%

---

## Functional Requirements

| ID   | Requirement summary                                     | Status | Notes |
|------|---------------------------------------------------------|--------|-------|
| F-34 | S3Client initialized with BACKEND_S3_ACCESS_KEY_ID and BACKEND_S3_SECRET_ACCESS_KEY explicit credentials | PASS | `s3.service.ts` credentials block confirmed; unit test asserts wiring; `.env.example` documents both vars |

---

## Non-Functional Requirements

| ID    | Requirement summary                          | Status | Notes |
|-------|----------------------------------------------|--------|-------|
| NF-03 | JWT auth on all routes                       | PASS   | Carried from prior epics — no regression |
| NF-07 | Logging / observability                      | PASS   | Carried from prior epics — no regression |

---

## Verification Details

### s3.service.ts credentials block
`apps/backend/src/services/s3.service.ts` line 11–17: `S3Client` constructor includes:
```
credentials: {
  accessKeyId: process.env.BACKEND_S3_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.BACKEND_S3_SECRET_ACCESS_KEY ?? "",
}
```
Status: CONFIRMED PRESENT

### Unit test
`apps/backend/src/tests/s3.service.test.ts` — describes "S3Client credential wiring" and asserts `S3Client` is called with `credentials.accessKeyId = "test-key-id"` and `credentials.secretAccessKey = "test-secret"` after setting `BACKEND_S3_ACCESS_KEY_ID` / `BACKEND_S3_SECRET_ACCESS_KEY` env vars.
Status: CONFIRMED PRESENT

### .env.example documentation
`apps/backend/.env.example` lines 31–32 document both `BACKEND_S3_ACCESS_KEY_ID=` and `BACKEND_S3_SECRET_ACCESS_KEY=` with an explanatory note about the deploy.yml credential naming convention.
Status: CONFIRMED PRESENT

### Test suite run
```
Test Files  16 passed (16)
      Tests  134 passed (134)
   Duration  21.28s
```
All 134 tests pass. The new S3 credentials unit test is included in this count.

---

## Known Defects
- [EPIC-13][MEDIUM] INFRA: terraform.tfvars tracked in git — contains live Anthropic API key, Supabase URL, JWT secret. Requires `git rm --cached` + history scrub + key rotation. Carried from prior epics.
- [EPIC-8][LOW] BE: getCandidateFilePath() dead code — future cleanup pass
- [EPIC-8][LOW] BE: AWS SDK v3 NodeVersionSupportWarning — harmless; carried
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no — acceptable at current scale; carried
- [EPIC-11][LOW] FE: 3s polling interval hardcoded — carried

---

## Test Artifacts
- Vitest output: 134 passed, 0 failed (16 files)
- Playwright E2E: not re-run (Epic 16 is BE-only; no new Playwright tests required; prior suite unaffected)
- Test run date: 2026-05-24

---

## Sign-off
[x] >= 80% coverage achieved (100% — 1/1 F-IDs pass) — advancing to 4.0-complete
