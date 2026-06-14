# Review Report — Epic 6

**Date:** 2026-05-11
**Phase:** 3.0-running → 3.0-complete
**Reviewer:** TechLead Agent

---

## Summary

Static code review and full unit test run for Epic 6 (S3 File Migration — F-24 + Deployment scaffolding).

- Issues found: 1 (LOW — dead code in candidates.service.ts)
- Issues fixed from prior epics: None (all prior HIGH/MEDIUM issues were resolved in Epic 4 and Epic 5)
- Blockers: None
- All tests pass: BE 60/60, FE 54/54

---

## Prior Issue Fixes

No outstanding HIGH or MEDIUM issues carried from prior epic TechLead summaries.

Summary of prior issue history:
- [EPIC-1][LOW] LoginPage bare axios — FIXED in Epic 2
- [EPIC-2][LOW] CandidateDetailsCard file links without VITE_API_URL — FIXED in Epic 4 (FE agent)
- [EPIC-3][HIGH] pdf-parse self-test ENOENT — FIXED in Epic 4
- [EPIC-3][HIGH] LinkedIn PDF reads as text — FIXED in Epic 4
- [EPIC-4][LOW] postScreening.service.ts missing cache_control — FIXED in Epic 5

None required action in Epic 6.

---

## API Contract Conformance

### Changed Endpoint: GET /candidates/:id/files/:type

| Check | Status | Notes |
|-------|--------|-------|
| Route exists | PASS | `apps/backend/src/routes/candidates.ts` |
| Handler uses S3 stream (not disk) | PASS | `getCandidateFileHandler` calls `getS3Stream(s3Key)` and pipes to response |
| 502 on S3 error | PASS | Inner try-catch returns 502 with message |
| 404 if no S3 key stored | PASS | `getCandidateFilePath` returns null → 404 |
| Content-Disposition: inline | PASS | Set from `path.basename(s3Key)` |
| Auth required | PASS | Behind `authMiddleware` |

### Unchanged Endpoints (sampled for conformance)

| Endpoint | Status |
|----------|--------|
| POST /candidates | PASS — uploadToS3 called; S3 key stored in cvFileName/linkedinFileName |
| POST /candidates/:id/pre-screen | PASS — reads from S3 via getS3Buffer + parsePdfBuffer |
| POST /candidates/:id/post-screen | PASS — transcript unchanged on disk |
| POST /candidates/:id/decision | PASS — unchanged |
| GET /candidates/:id/report | PASS — unchanged |
| GET /health | PASS — unchanged |
| POST /auth/login | PASS — unchanged |

---

## Static Review Findings

### apps/backend/src/services/s3.service.ts (NEW)

- PASS: Uses `@aws-sdk/client-s3` v3 with `S3Client`, `PutObjectCommand`, `GetObjectCommand`
- PASS: `uploadToS3(folder, file)` returns S3 key `<folder>/<timestamp>-<originalname>`
- PASS: `getS3Stream(key)` returns `Readable` stream from S3 body
- PASS: `getS3Buffer(key)` accumulates stream chunks into Buffer via promise
- PASS: No hardcoded credentials — reads `AWS_UPLOADS_BUCKET` and `AWS_REGION` from env
- PASS: S3Client region defaults to `us-east-1` if env var absent — safe fallback

### apps/backend/src/middleware/upload.ts (MODIFIED)

- PASS: CV and LinkedIn fields use `multer.memoryStorage()` — disk storage removed
- PASS: Transcript storage uses `multer.diskStorage()` — unchanged per F-24 scope
- PASS: File filter accepts PDF and plain text only
- PASS: 10 MB limit per file

### apps/backend/src/controllers/candidates.controller.ts (MODIFIED)

- PASS: `createCandidateHandler` calls `uploadToS3("cv", cvFile)` and stores returned key
- PASS: `getCandidateFileHandler` uses `result.fileName` (S3 key) not `result.filePath`
- PASS: 502 error is correctly surfaced for S3 retrieval failures
- NOTE (LOW): `getCandidateFilePath` in `candidates.service.ts` still computes a `filePath` from the old disk path logic (line 274). This field is returned but never used by the Epic 6 controller. Dead code — no bug, but a future cleanup item.

### apps/backend/src/services/screening.service.ts (MODIFIED)

- PASS: CV read uses `getS3Buffer(candidate.cvFileName)` + extension check for PDF vs text
- PASS: LinkedIn read uses same `getS3Buffer` + extension check pattern
- PASS: `parsePdfBuffer(cvBuffer)` used for PDF; `buffer.toString("utf-8")` for text
- PASS: Anthropic model is `claude-sonnet-4-6` (verified)
- PASS: Prompt caching enabled via `cache_control: { type: "ephemeral" }` on system block

### apps/backend/src/services/fileParser.service.ts (MODIFIED)

- PASS: `parsePdfBuffer(buffer: Buffer)` export added
- PASS: Uses same `pdf-parse/lib/pdf-parse.js` import (no self-test triggered)
- PASS: Returns `""` on error — non-fatal
- PASS: Existing `parsePdf(filePath)` retained for backward compat (postScreening transcript)

### apps/backend/src/app.ts (MODIFIED)

- PASS: `mkdirSync("uploads/cv")` removed
- PASS: `mkdirSync("uploads/linkedin")` removed
- PASS: `mkdirSync("uploads/transcript", { recursive: true })` retained
- PASS: CORS configured from `CORS_ORIGIN` env var — not open wildcard

### apps/backend/ecosystem.config.cjs (NEW)

- PASS: PM2 config present with correct structure
- PASS: `name: "recruitment-api"`, `script: "dist/index.js"`, `autorestart: true`, `watch: false`
- PASS: No secrets stored in file — env vars must be set on system

### Security

- PASS: No API keys, secrets, or PII in source code
- PASS: No hardcoded URLs or credentials
- PASS: CORS configured with env var — not wildcard
- PASS: Auth middleware enforces JWT on all routes except `/health` and `/auth/login`

### TypeScript Quality

- PASS: No `any` types introduced in Epic 6 files
- NOTE: Two pre-existing `any[]` usages in `candidates.service.ts` (JSON parse of stored JSON columns) — each has `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment. Acceptable documented exception.

### Infrastructure Scaffolding

- NOTE: Terraform files (`infrastructure/terraform/`) and GitHub Actions workflows (`.github/workflows/`) are NOT present. These are DevOps agent deliverables — expected to be created in the DevOps phase (Epic 6, phase 5.0). TechLead scope is limited to `apps/` code.

---

## Test Results

### Backend (Vitest)

```
Test Files: 7 passed (7)
Tests:      60 passed (60)
Duration:   54.84s
```

All 7 test files pass:
- `health.test.ts` — health endpoint
- `auth.test.ts` — auth login flows
- `candidates.test.ts` — CRUD + S3 file upload/stream (S3 mocked)
- `screening.test.ts` — pre-screening with S3 buffer mock (Anthropic mocked)
- `postScreening.test.ts` — post-screening with disk transcript (Anthropic mocked)
- `fileParser.test.ts` — parsePdf, parsePdfBuffer, readTextFile
- `report.test.ts` — report endpoint

AWS SDK Node version deprecation warning (v3 → Node 22 required after Jan 2027) is cosmetic — does not affect test outcomes. Node 22 will be installed on Lightsail per design spec.

### Frontend (Vitest)

```
Test Files: 11 passed (11)
Tests:      54 passed (54)
Duration:   5.79s
```

No frontend code changes in Epic 6 — all 54 prior tests retained and passing.

---

## BRD / Amendment Coverage

Epic 6 scope: NF-01, NF-02, NF-05, NF-06 (infrastructure — DevOps deliverable) + F-24 (S3 migration — BE deliverable)

| Requirement | Status | Notes |
|-------------|--------|-------|
| F-24: CV/LinkedIn files in S3 | PASS | uploadToS3, getS3Stream, getS3Buffer implemented; screening reads from S3 |
| NF-01: Minimal cost infra | PARTIAL | Terraform not yet written (DevOps phase); architecture decisions are correct (Lightsail $3.50, Supabase free, S3 within free tier) |
| NF-02: Destroyable via IaC | PARTIAL | Terraform not yet written (DevOps phase) |
| NF-05: Horizontal scale architecture | PARTIAL | S3 for files enables stateless backend — PM2 + ecosystem.config.cjs present |
| NF-06: Public URL after deployment | PARTIAL | Terraform not yet written (DevOps phase) |

PARTIAL on NF-01/02/05/06 is expected — these are infrastructure requirements implemented by the DevOps agent in phase 5.0, which has not run yet.

---

## Known Limitations / Deferred Items

1. `infrastructure/terraform/` — 8 Terraform files specified in design spec — created by DevOps agent, not TechLead scope
2. `.github/workflows/ci.yml` and `deploy.yml` — created by DevOps agent, not TechLead scope
3. `getCandidateFilePath` in `candidates.service.ts` line 274 computes a stale disk `filePath` value that is never used post-F-24 — dead code, cleanup deferred
4. AWS SDK Node 22 deprecation warning — harmless in current test environment; production Lightsail will run Node 22 per design spec

---

## Sign-off

**Status: APPROVED — all 114 tests pass, no blockers, Epic 6 code conforms to design spec.**
