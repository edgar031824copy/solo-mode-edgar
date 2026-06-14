# Review Report — Epic 11 (F-29: Async Pre/Post-Screening)

**Date:** 2026-05-15
**Phase:** 3.0-running → 3.0-complete
**Reviewer:** TechLead Agent

---

## Summary

Epic 11 implements F-29 — converting both screening endpoints from synchronous (blocking) to async (202 fire-and-forget) to eliminate the CloudFront 60s timeout for long-running Claude API calls.

- Issues found during static review: **0**
- Issues fixed: **0** (no prior HIGH/MEDIUM issues; no new issues)
- Sign-off: **APPROVED**

---

## Prior Issue Fixes

None. All prior TechLead summaries (Epics 1–10) carried only [LOW] severity items. No [HIGH] or [MEDIUM] issues required remediation before reviewing Epic 11.

---

## Static Review Findings

### API Contract Conformance

| Endpoint | Spec | Implementation | Result |
|----------|------|----------------|--------|
| POST /candidates/:id/pre-screen | 202 + `{ message: "Pre-screening started" }` | Returns 202 with correct JSON body; 404 on missing candidate; 400 on no files | PASS |
| POST /candidates/:id/post-screen | 202 + `{ message: "Post-screening started" }` | Returns 202 with correct JSON body; 400 on no transcript; 404 on missing candidate | PASS |
| GET /candidates/:id | Response includes `preScreeningError: string \| null` | `candidateInclude` uses `include` (not `select`), so Prisma returns all fields including `preScreeningError` automatically | PASS |

Validation order for post-screen matches spec exactly: transcript check (400) before candidate lookup (404).

### Database Schema Conformance

| Item | Spec | Implementation | Result |
|------|------|----------------|--------|
| `Candidate.preScreeningError String?` | New nullable field | Present in `schema.prisma` with F-29 comment | PASS |
| Migration SQL | `ALTER TABLE candidates ADD COLUMN "preScreeningError" TEXT` | `20260515202418_epic11_prescreening_error/migration.sql` — exact match | PASS |
| No `PostScreening` error field | Design spec: shared field only | `PostScreening` model unchanged | PASS |

### Fire-and-Forget Correctness

- `void runPreScreeningAsync(id)` — correctly uses `void` to discard the Promise, preventing unhandled rejection warnings.
- `void runPostScreeningAsync(id, transcriptFile)` — same pattern.
- Both async helpers export named exports (`export async function`) for direct test access — conforms to spec.
- Error capture in both helpers: `err instanceof Error ? err.message : "Pre-screening failed"` — correct fallback.
- `logger.error` called in both failure paths — conforms to spec.

### Polling Correctness (FE)

**PreScreeningTab stop conditions:**
- `candidate.status === 'pre_screened'` — implemented
- `candidate.preScreening != null` — implemented (belt-and-suspenders)
- `candidate.preScreeningError` truthy — implemented

**PostScreeningTab stop conditions (design spec: three conditions):**
- `candidate.status === 'decided'` — implemented
- `candidate.preScreening != null && candidate.postScreening?.aiRecommendation != null` — implemented
- `candidate.preScreeningError` truthy — implemented

All three stop conditions match the spec exactly.

### Interval Cleanup

- `pollingRef` (`useRef`) used in both components — avoids stale closure.
- `stopPolling()` declared before the `useEffect` that references it — correct closure scope.
- Cleanup `useEffect(() => () => stopPolling(), [])` present in both components — prevents interval leak on unmount.
- `clearInterval` called only when `pollingRef.current` is non-null — no double-clear bugs.

### Type Safety

- `CandidateDetail.preScreeningError: string | null` added to `apps/frontend/src/lib/types.ts`.
- Both `PreScreeningTab` and `PostScreeningTab` typed via `Props { candidate: CandidateDetail; onRefresh: () => void }`.
- No `any` types introduced in Epic 11 code.
- TypeScript build (`vite build`) completed without errors.

### Security

- No API keys, secrets, or PII in new code.
- No hardcoded URLs.
- Auth middleware unchanged; pre/post-screen routes remain protected.

### Code Quality

- No dead code introduced.
- No unused imports.
- All new exports are named (not default) — testable by import.

---

## Test Results

### Backend — Vitest

```
Test Files  15 passed (15)
     Tests  133 passed (133)
  Duration  21.30s
```

New test file `asyncScreening.test.ts` covers all 12 required scenarios from design § Test Plan:
- Pre-screen: 202 response, 404 not found, 400 no files, preScreeningError cleared, background success (null preserved), background failure (error written)
- Post-screen: 202 response, 400 no transcript, 404 not found, background failure (error written)
- GET /candidates/:id: preScreeningError null when clean, preScreeningError returns string when set

Existing `screening.test.ts` and `postScreening.test.ts` updated to 202-async pattern — all pass.

### Frontend — Vitest

```
Test Files  11 passed (11)
     Tests  58 passed (58)
  Duration  5.39s
```

New tests in `PreScreeningTab.test.tsx` and `PostScreeningTab.test.tsx` cover all 8 required scenarios from design § Test Plan:
- After 202: polling state + spinner + "Analyzing..."
- On status advance: polling stops, done state renders
- On preScreeningError: polling stops, error message renders
- On unmount during polling: clearInterval called (4 tests × 2 components)

### Frontend — Build

```
vite build: ✓ 2077 modules transformed, built in 559ms
TypeScript: 0 errors
```

Chunk-size warning is pre-existing (not introduced by Epic 11) and is not a blocker.

---

## BRD Functional Coverage

Epic 11 is driven entirely by `amendments.md` (F-29). No BRD F-IDs are scoped to this epic. All prior F-01–F-23 functionality is preserved (no regressions in 133 BE + 58 FE tests).

| Amendment | Description | Status |
|-----------|-------------|--------|
| F-29 | Async pre/post-screening (202 + polling) | PASS |

---

## Known Limitations / Deferred Items

- [LOW] Polling interval is 3s (hardcoded). Future: make configurable or use exponential backoff.
- [LOW] If the browser tab is closed while polling, the background job completes but the error is only visible on next page load (expected behavior per design).
- Carried from prior epics: `getCandidateFilePath()` dead code (Epic 8 LOW), AWS SDK v3 NodeVersionSupportWarning (Epic 8 LOW), StrictHostKeyChecking=no in CI (Epic 8 LOW).
