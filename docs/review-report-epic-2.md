# Review Report — Epic 2: Candidate Management

**Date:** 2026-05-09
**Epic:** 2
**Phase:** 3.0-complete
**Reviewer:** TechLead Agent

---

## Summary

Issues found: 0 blockers, 0 high, 0 medium, 1 low (documented below)
Issues fixed during this review: 0 (no failures required code changes)
Prior known issues resolved: 1 ([EPIC-1][LOW] LoginPage bare axios — confirmed fixed by FE agent)

Both test suites passed without any fixes required.

---

## Prior Issue Fixes

**[EPIC-1][LOW] FE: LoginPage.tsx bare axios replaced by shared api instance**

Verification: `apps/frontend/src/pages/LoginPage.tsx` line 9 imports `api from '../lib/api'` and line 31 calls `api.post<LoginResponse>('/auth/login', ...)`. The bare `axios` import is gone. The matching test `LoginPage.test.tsx` mocks `'../lib/api'` (not `'axios'`). Issue is fully resolved.

---

## API Contract Conformance

All 6 endpoints from `docs/design-epic-2.md § API Contract` are implemented.

| Endpoint | Method | Implemented | Auth | Response Shape | Verdict |
|----------|--------|-------------|------|----------------|---------|
| `/candidates` | POST | candidates.controller.ts `createCandidateHandler` | yes — global `authMiddleware` in app.ts | 201 with full candidate object; 400 on missing name; 401 on no token | PASS |
| `/candidates` | GET | `listCandidatesHandler` | yes | 200 array with `recruiterChoice` flattened from PostScreening; 401 on no token | PASS |
| `/candidates/:id` | GET | `getCandidateHandler` | yes | 200 full candidate with `preScreening` + `postScreening` relations (null when absent); 404 for unknown id | PASS |
| `/candidates/:id` | PUT | `updateCandidateHandler` | yes | 200 full candidate after update; 400 on empty body; 404 via P2025 catch | PASS |
| `/candidates/:id` | DELETE | `deleteCandidateHandler` | yes | 204 no body; 404 for unknown id; cascade delete confirmed by schema `onDelete: Cascade` | PASS |
| `/candidates/:id/files/:type` | GET | `getCandidateFileHandler` | yes | Binary stream via `res.sendFile`; 400 for invalid type; 404 for missing file or record | PASS |

**GET /candidates recruiterChoice flattening (F-14):** `listCandidates()` in `candidates.service.ts` uses `include: { postScreening: { select: { recruiterChoice: true } } }` and maps `c.postScreening?.recruiterChoice ?? null` to top-level — correct.

---

## Database Schema Conformance

`apps/backend/prisma/schema.prisma` matches `docs/design-epic-2.md § DB Schema` exactly:

- `Candidate` model: all fields present with correct types, defaults, and `@@map("candidates")` — PASS
- `PreScreening` model: `candidateId @unique`, `onDelete: Cascade`, all nullable fields — PASS
- `PostScreening` model: `candidateId @unique`, `onDelete: Cascade`, `PostScreeningDecision?` fields — PASS
- `CandidateStatus` enum: `pending | pre_screened | decided` — PASS
- `PostScreeningDecision` enum: `pass | no_pass` — PASS
- No `recruiterId` FK on Candidate (correct per spec — single-tenant MVP) — PASS
- Migration `20260509191355_epic_2_candidate_management` is present — PASS

---

## Anthropic Integration

No Anthropic API calls in Epic 2. First call is Epic 3 (`POST /candidates/:id/pre-screen`). No violations — PASS.

---

## Security Review

| Item | Finding | Verdict |
|------|---------|---------|
| API keys/secrets in source | None. All secrets via `process.env`. JWT_SECRET in auth.ts reads `process.env.JWT_SECRET` | PASS |
| Hardcoded credentials | `password123` in `e2e/helpers/auth.ts` only — test fixture, not source code | PASS |
| CORS | `app.ts` uses `process.env.CORS_ORIGIN ?? "http://localhost:5173"` — not open wildcard | PASS |
| Auth middleware | `authMiddleware` is a passthrough enforcer (returns 401 on invalid/missing token, calls `next()` on valid) — applied after `/health` and `/auth/login` in `app.ts` | PASS |
| PII storage | File content never returned in API responses — only filenames stored. `uploads/` in `.gitignore` (NF-03b) | PASS |

---

## Code Quality

| Item | Finding | Verdict |
|------|---------|---------|
| `any` types in TS | No bare `any` in source. One `@ts-disable`-equivalent comment in `fileParser.service.ts` for `pdf-parse` CJS/ESM interop — explicitly annotated with `eslint-disable-next-line` comment | PASS |
| Zod validation | BE: `updateCandidateHandler` uses `updateSchema.safeParse(req.body)`. `createCandidateHandler` validates `name` presence manually (multipart body — Zod not applicable to form fields pre-parsed by multer; this is correct) | PASS |
| Dead code/unused imports | None found | PASS |
| FE uses shared api instance | All FE components (`DashboardPage`, `CandidateDetailPage`, `NewCandidateDialog`, `DeleteConfirmDialog`) import `api from '@/lib/api'` — never bare axios | PASS |

---

## Test Results

### Backend (Vitest)
```
Test Files  3 passed | 1 skipped (4)
      Tests  23 passed | 2 todo (25)
```
- 3 test files active: `health.test.ts`, `auth.test.ts`, `candidates.test.ts`
- 1 skipped: `screening.test.ts` (epic 3–4 stubs, expected)
- 2 todo stubs: `candidates.test.ts` placeholders for file-serve and recruiterChoice badge tests (documented in code as epics 3–4)
- **0 failures**

### Frontend (Vitest)
```
Test Files  8 passed (8)
      Tests  35 passed (35)
```
- 8 test files: `LoginPage`, `ProtectedRoute`, `DashboardPage`, `CandidateDetailPage`, `CandidateStatusBadge`, `FileDropZone`, `NewCandidateDialog`, `DeleteConfirmDialog`
- **0 failures**

**Combined: 58 passed, 0 failed**

---

## BRD § 5.3 Functional Coverage

F-IDs in scope for Epic 2: F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18

| ID | Requirement | Status | Evidence |
|----|-------------|--------|---------|
| F-01 | Recruiter uploads CV (PDF), LinkedIn export, and optional notes | PASS | `POST /candidates` accepts `cv` + `linkedin` multipart fields; multer disk storage to `uploads/cv/` and `uploads/linkedin/`; `NewCandidateDialog` uses `FileDropZone` for both |
| F-02 | System stores uploaded filenames on candidate record | PASS | `cvFileName` + `linkedinFileName` stored on `Candidate` Prisma model; returned in all list/detail responses |
| F-13 | Simple, intuitive UI — no technical knowledge required | PASS | shadcn/ui components throughout; clear labels; error messages on failure; loading states |
| F-14 | Candidate list with status badges; decided candidates show Pass/No Pass badge from `recruiterChoice` | PASS | `GET /candidates` returns `recruiterChoice`; `CandidateStatusBadge` renders correct variants per spec; dashboard table displays badge per candidate |
| F-15 | Single candidate detail view — tab-based layout (Pre-Screening / Post-Screening tabs) with Details card | PASS | `CandidateDetailPage` uses shadcn Tabs with `pre-screening` + `post-screening` tabs; `CandidateDetailsCard` shows Created, Updated, CV File, LinkedIn File, Notes |
| F-16 | File upload interface (drag & drop or button) | PASS | `FileDropZone` component handles HTML5 drag-and-drop events + click-to-browse via hidden file input |
| F-17 | One-click execution button for each phase | PARTIAL | `PreScreeningTab` has disabled "Run Pre-Screening" button (no-op placeholder); `PostScreeningTab` has disabled "Run Post-Screening" button. Buttons are present and correctly disabled in Epic 2 — Epic 3 and Epic 4 wire them up. By design. |
| F-18 | Delete candidate with confirmation dialog; cascade delete from database | PASS | `DeleteConfirmDialog` (shadcn AlertDialog) requires explicit confirm; `DELETE /candidates/:id` cascades to `PreScreening` + `PostScreening` via Prisma `onDelete: Cascade` |

**Epic 2 coverage: 7 PASS + 1 PARTIAL (by design) = 8/8 F-IDs addressed. No FAILs.**

---

## BRD § 5.4 Non-Functional Coverage (Epic 2 scope)

| ID | Requirement | Status | Evidence |
|----|-------------|--------|---------|
| NF-03b | No candidate PII stored beyond session unless explicitly persisted | PASS | File content never returned in API responses; `uploads/` excluded from git; filenames (not content) stored in DB |

---

## Known Limitations and Deferred Items

**[EPIC-2][LOW] FE: `CandidateDetailsCard` file links use bare relative paths (`/candidates/:id/files/cv`) without the `VITE_API_URL` prefix.**

In development, the Vite proxy (`vite.config.ts`) routes `/candidates` → `http://localhost:3001`, so the links work correctly. In production (CloudFront + S3 + Lightsail), these `<a href>` links will request files from CloudFront, not the Lightsail backend, resulting in 404s. The Epic 6 DevOps agent must either configure a CloudFront behavior to forward `/candidates/*/files/*` to the Lightsail origin, or the FE should prefix these links with `VITE_API_URL`. This is a deployment concern, not an Epic 2 unit test concern.

---

## Sign-off

**APPROVED** — All 58 tests pass (23 BE + 35 FE). All 8 Epic 2 F-IDs addressed (7 PASS, 1 PARTIAL by design). No blockers, no high or medium issues. One low issue documented for DevOps consideration.
