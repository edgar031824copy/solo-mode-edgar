---
epic: 11
agent: be
status: complete
phase: 2.0-complete
outputs:
  - apps/backend/prisma/schema.prisma
  - apps/backend/prisma/migrations/20260515202418_epic11_prescreening_error/
  - apps/backend/src/controllers/candidates.controller.ts
  - apps/backend/src/tests/asyncScreening.test.ts
  - apps/backend/src/tests/screening.test.ts
  - apps/backend/src/tests/postScreening.test.ts
---

Date: 2026-05-15
Epic: 11
Phase: 2.0-complete

## Routes Implemented
POST /candidates/:id/pre-screen — preScreenCandidateHandler (changed: 202 async)
POST /candidates/:id/post-screen — postScreenCandidateHandler (changed: 202 async)
GET /candidates/:id — getCandidateHandler (unchanged; preScreeningError now in response)

## Database Models
Candidate: +preScreeningError String? (new nullable field; shared signal for both pre/post failures)

## Migrations
20260515202418_epic11_prescreening_error — ALTER TABLE candidates ADD COLUMN "preScreeningError" TEXT

## Changes

### apps/backend/prisma/schema.prisma
Added `preScreeningError String?` to Candidate model (F-29 comment).

### apps/backend/src/controllers/candidates.controller.ts
- Added `prisma` and `logger` imports (were missing from controller, used inline in handlers).
- Replaced `preScreenCandidateHandler`: sync validation (404/400) → clear preScreeningError → 202 → void runPreScreeningAsync.
- Added `runPreScreeningAsync(candidateId)` — exported named export for test access; catches errors and writes to preScreeningError.
- Replaced `postScreenCandidateHandler`: transcript check (400) → candidate check (404) → clear preScreeningError → 202 → void runPostScreeningAsync.
- Added `runPostScreeningAsync(candidateId, transcriptFile)` — exported named export; same error-capture pattern.
- screening.service.ts and postScreening.service.ts unchanged.
- candidates.service.ts unchanged — getCandidateById uses findUnique with include (no select), returns preScreeningError automatically.

### apps/backend/src/tests/asyncScreening.test.ts (new file)
12 integration tests covering all async scenarios per design-epic-11 § Test Plan.

### apps/backend/src/tests/screening.test.ts (updated)
Rewrote tests from 200-synchronous to 202-async pattern.
Tests that verify DB state call runPreScreeningAsync directly (avoids double-fire race).

### apps/backend/src/tests/postScreening.test.ts (updated)
Rewrote tests from 200-synchronous to 202-async pattern.
Added makeTempTranscriptFile() helper — creates real file on disk at uploads/transcript/<filename>
because runPostScreening reads transcript via fs.readFileSync(transcriptFile.filename).
Background job tests call runPreScreeningAsync/runPostScreeningAsync directly (no HTTP post + re-call).

## Test Results
Integration: 133 passed, 0 failed (15 files)
New asyncScreening.test.ts: 12 passed
All pre-existing tests updated and passing.

## Env Vars Required
DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY

## Deviations from design.md
None. runPreScreeningAsync and runPostScreeningAsync exported as named exports per design spec.
postScreening.test.ts uses direct service calls (not HTTP) for background-job DB assertions
to avoid double-fire-and-forget race condition in tests — test behavior is equivalent.
