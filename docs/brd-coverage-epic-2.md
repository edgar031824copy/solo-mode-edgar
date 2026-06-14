# BRD Coverage Report — Epic 2
Date: 2026-05-09
Environment: local (localhost:5173 + localhost:3001)
Overall coverage: 8 / 8 Epic-2 F-IDs = 100%

## Functional Requirements

| ID   | Requirement summary                                             | Status | Notes |
|------|-----------------------------------------------------------------|--------|-------|
| F-01 | Recruiter uploads CV (PDF), LinkedIn export, optional notes     | PASS   | Multipart upload via FileDropZone confirmed working |
| F-02 | Stored filenames shown in detail view and list                  | PASS   | cvFileName + linkedinFileName shown in Details card and list row |
| F-13 | Simple, intuitive UI — no technical knowledge required          | PASS   | Dashboard heading, New Candidate button, table all render correctly |
| F-14 | Candidate list view with status badge (Pending/Pre-screened/decided) | PASS | Table renders with Name + Status columns; Pending badge confirmed |
| F-15 | Single candidate detail view — tab layout + Details card        | PASS   | Pre-Screening/Post-Screening tabs + Created/Updated/CV/LinkedIn in Details card |
| F-16 | File upload interface (drag & drop or button)                   | PASS   | FileDropZone with hidden input; drop-zone shows filename after selection |
| F-17 | One-click execution buttons visible (disabled stubs in Epic 2)  | PASS   | "Run Pre-Screening" and "Run Post-Screening" buttons present in respective tabs |
| F-18 | Delete candidate with confirmation dialog; cascade removal      | PASS   | Actions menu > Delete > AlertDialog > Confirm — row removed from list |

## Non-Functional Requirements

| ID     | Requirement summary                                      | Status | Notes |
|--------|----------------------------------------------------------|--------|-------|
| NF-03b | No candidate PII stored beyond modeled fields            | PASS   | GET /candidates response verified to contain only allowed fields |

## Known Defects

- **F-20 (Epic 1)**: `api.ts` 401 interceptor fires on login failure, redirecting to `/login` before the error Alert can render — the error message never appears. This breaks the "invalid credentials show error" auth tests. Severity: **Medium**. Root cause: `api.interceptors.response` calls `window.location.href = '/login'` on any 401, including the auth/login endpoint itself. Fix: exclude the `/auth/login` endpoint from the redirect interceptor. This is an application bug — not addressed in Epic 2 scope.

## Test Artifacts
- Playwright HTML report: `apps/frontend/playwright-report/index.html`
- Test run date: 2026-05-09
- Epic 2 pass rate: 8/8 = 100%
- Full suite pass rate: 15/17 (2 pre-existing Epic 1 defects excluded from Epic 2 gate)

## Sign-off
[x] >= 80% coverage achieved (100%) → advance to 4.0-complete → DevOps deploys (future)
