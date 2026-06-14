# Review Report — Epic 3 (Pre-Screening)

**Date:** 2026-05-10
**Phase:** 3.0-complete
**Reviewer:** TechLead Agent

---

## Summary

- Issues found: 0 blockers, 0 regressions
- Prior known issues resolved: 1 ([EPIC-2][MEDIUM])
- Tests: 30 BE passed / 0 failed; 41 FE passed / 0 failed
- Sign-off: APPROVED

---

## Prior Issue Fixes

| Issue | Status |
|-------|--------|
| [EPIC-2][MEDIUM] FE: `api.ts` 401 interceptor redirects on `/auth/login` 401s | FIXED by BE agent. `!error.config?.url?.includes('/auth/login')` guard present in `apps/frontend/src/lib/api.ts` line 27. Login form error alert now renders correctly. |
| [EPIC-2][LOW] FE: file links missing `VITE_API_URL` prefix | Deferred to Epic 6 per prior TechLead note — unchanged, no action taken. |

---

## API Contract Conformance

| Endpoint | Spec | Implementation | Result |
|----------|------|----------------|--------|
| `POST /candidates/:id/pre-screen` | Auth required; 200 PreScreening; 400 no-files; 404 not-found; 502 malformed-JSON | `preScreenCandidateHandler` in `candidates.controller.ts`; registered before `GET /candidates/:id` to prevent route conflict | PASS |
| `GET /candidates/:id` | Returns `preScreening` relation | Unchanged from Epic 2; `preScreening` relation populated by Epic 3 upsert | PASS |

**Route registration order:** `POST /candidates/:id/pre-screen` is correctly registered before `GET /candidates/:id` in `apps/backend/src/routes/candidates.ts`, preventing Express from matching the nested route as a candidate ID.

---

## Database Schema Conformance

`prisma/schema.prisma` matches `docs/design-epic-3.md § Database Schema` exactly:

- `PreScreening` model with `id`, `candidateId` (unique FK + Cascade), `profileSummary?`, `redFlagsJson?`, `interviewQuestionsJson?`, `overallFit?`, `createdAt`, `updatedAt`
- No new migration required — all fields present since Epic 2 migration (`20260509191355_epic_2_candidate_management`)
- `Candidate.position` field (`String?`) present and used as the target-position input for Claude prompt

---

## Anthropic API Integration Conformance

| Check | Result |
|-------|--------|
| Model is `claude-sonnet-4-6` | PASS — `screening.service.ts` line 115 |
| System prompt matches design doc exactly | PASS — `PRESCREENING_SYSTEM_PROMPT` constant is verbatim from `docs/design-epic-3.md § Anthropic API Integration` |
| System prompt is fixed constant (never interpolated) | PASS — candidate data injected in user-turn only via `buildUserPrompt()` |
| `max_tokens: 2048` | PASS |
| `buildUserPrompt()` matches spec | PASS — positionLine, cvSection, linkedinSection format matches design doc |
| `JSON.stringify(redFlags)` stored in `redFlagsJson` | PASS — `screening.service.ts` lines 217, 223 |
| `JSON.stringify(interviewQuestions)` stored in `interviewQuestionsJson` | PASS — `screening.service.ts` lines 218, 224 |
| 502 on malformed JSON; no partial record written | PASS — `callClaudeWithRetry` throws before the `$transaction`; error handler returns 502 |
| Single Prisma `$transaction` upserts `PreScreening` + sets `Candidate.status = pre_screened` | PASS — `screening.service.ts` lines 211–232 |
| Prompt caching: design doc does not require caching on this call (no `cache_control` block specified) | N/A — not required for Epic 3 |

**Note on retry logic:** The implementation adds one silent retry on parse failure (`callClaudeWithRetry`). This is a non-spec additive behavior that is strictly beneficial (reduces transient 502s) and does not change the external API contract. Both retry attempts must fail before a 502 is returned — the 502 test confirms this by leaving the mock always-invalid.

---

## Security Review

| Check | Result |
|-------|--------|
| No API keys or secrets in source | PASS — `ANTHROPIC_API_KEY` read from `process.env` |
| No hardcoded URLs or credentials | PASS |
| CORS configured with specific origin (not wildcard) | PASS — `process.env.CORS_ORIGIN ?? "http://localhost:5173"` |
| Auth middleware enforces JWT on all routes except `/health` and `/auth/login` | PASS — `app.ts` mounts `authMiddleware` after public routes; `POST /candidates/:id/pre-screen` is protected |

---

## Code Quality

| Check | Result |
|-------|--------|
| No `any` types (undocumented) | PASS — `unknown` used for caught errors; casts are documented |
| Zod validation on all BE request bodies | PASS — pre-screen endpoint takes no body; update endpoint uses `updateSchema` |
| All routes have tests | PASS — 7 pre-screen tests in `screening.test.ts` |
| No dead code or unused imports | PASS |
| `stripJsonFences()` helper handles markdown-wrapped JSON from Claude | PASS — defensive against Claude wrapping output in ```json ``` |

---

## Test Results

### Backend (Vitest)

```
Test Files: 4 passed (4)
Tests:      30 passed (0 failed)
```

Files: `health.test.ts` (1), `auth.test.ts` (9), `candidates.test.ts` (14), `screening.test.ts` (7 new — all pass)

### Frontend (Vitest)

```
Test Files: 9 passed (9)
Tests:      41 passed (0 failed)
```

New file: `PreScreeningTab.test.tsx` (6 tests — idle, loading, error, results, re-run button, onRefresh callback — all pass)

---

## BRD Functional Coverage (Epic 3 F-IDs)

| F-ID | Requirement | Status |
|------|-------------|--------|
| F-03 | Anthropic API analyzes experience, skills, and background against target position | PASS — `runPreScreening()` calls `claude-sonnet-4-6` with position in prompt |
| F-04 | 5 personalized interview questions, some probing role-specific fit | PASS — system prompt enforces exactly 5 questions: 3 verification + 2 role-fit |
| F-05 | Red flags and inconsistencies between CV and LinkedIn detected | PASS — `redFlags` array in output; `high`/`medium`/`low` severity; source `cv`/`linkedin`/`gap` |
| F-06 | Output displayed in recruiter dashboard: Questions, Red Flags, Profile Summary | PASS — `PreScreeningTab.tsx` renders all four states; results state renders profile summary, red flags, 5 questions with type badges |

All 4 Epic 3 F-IDs: PASS (100%)

---

## Frontend Component Conformance

| Spec Item | Implementation | Result |
|-----------|----------------|--------|
| State 1 (idle) — "No pre-screening data yet." + enabled button | `PreScreeningTab.tsx` lines 76–83 | PASS |
| State 2 (loading) — disabled button with spinner + "Analyzing candidate..." | Lines 86–99 | PASS |
| State 3 (error) — destructive Alert + re-enabled button | Lines 101–113 | PASS |
| State 4 (done) — Profile Summary card, Red Flags card, Interview Questions card, Re-run button | Lines 116–206 | PASS |
| Severity badge colors: high=destructive, medium=yellow, low=outline | Lines 144–153 | PASS |
| Type badges: verification=secondary, role-fit=default | Lines 179–186 | PASS |
| `onRefresh` prop wired in `CandidateDetailPage.tsx` | `CandidateDetailPage.tsx` line 92 | PASS |
| `fetchCandidate` extracted as named function and passed as `onRefresh` | Lines 22–35, 92 | PASS |
| JSON parsed client-side with try/catch | `useMemo` blocks lines 38–56 | PASS |

---

## Known Limitations / Deferred Items

- [EPIC-2][LOW] FE: `CandidateDetailsCard` file links use bare relative paths without `VITE_API_URL` prefix. Deferred to Epic 6 DevOps per prior TechLead note.
- The `apps/backend/src/routes/screening.ts` stub file is still empty (no routes mounted there). `POST /candidates/:id/pre-screen` is correctly mounted in `candidates.ts` instead. The stub will be used or removed by Epic 4.
