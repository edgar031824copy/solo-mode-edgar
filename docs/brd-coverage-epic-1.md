# BRD Coverage Report
Date: 2026-05-09
Environment: local (localhost:5173 + localhost:3001)
Overall coverage: 5 / 5 requirements (Epic 1 F-IDs) = 100%

## Functional Requirements

| ID   | Requirement summary                                              | Status | Notes |
|------|------------------------------------------------------------------|--------|-------|
| F-19 | Recruiter model with id, email, passwordHash, name              | PASS   | Verified via successful seed upsert and login returning recruiter object with id/email/name |
| F-20 | POST /auth/login returns signed JWT (1h expiry)                 | PASS   | Login returns 200 + token stored in localStorage; token validated non-null and non-empty |
| F-21 | Protected routes require Authorization: Bearer <token>          | PASS   | ProtectedRoute redirects to /login when no token in localStorage |
| F-22 | /login page renders; 401 → /login; logout clears + redirects   | PASS   | Login page renders with email+password fields; protected route redirect works; logout clears localStorage and redirects to /login |
| F-23 | Seed user recruiter@gorilla.com / password123 works             | PASS   | Seed runs idempotently (upsert); credentials authenticate successfully in both direct API test and Playwright UI test |

## Non-Functional Requirements

| ID    | Requirement summary                    | Status | Notes |
|-------|----------------------------------------|--------|-------|
| NF-03 | JWT custom middleware                  | PASS   | Middleware blocks unauthenticated requests; ProtectedRoute renders redirect; all protected FE routes guard correctly |
| NF-04 | Repository private (no Gorilla data)   | PASS   | .env not committed; credentials in local env file only; no PII in source code |

## Known Defects

- [EPIC-1][LOW] FE: LoginPage.tsx uses bare `axios` import instead of shared `api` Axios instance from `src/lib/api.ts` — the 401 response interceptor is bypassed for the login call. Functionally harmless for Epic 1 (login is public), but Epic 2+ API calls must use the shared instance for consistency. (Carried from TechLead sign-off — no regression in QA tests.)

## Test Artifacts

- Playwright HTML report: `apps/frontend/playwright-report/index.html`
- Test files: `apps/frontend/e2e/auth.spec.ts`, `apps/frontend/e2e/helpers/auth.ts`
- Test run date: 2026-05-09
- Pass rate: 9/9 tests = 100% (covering all 5 F-IDs for Epic 1)

## Sign-off

[x] >= 80% coverage achieved (100%) → advance to 4.0-complete → proceed to Epic 2
