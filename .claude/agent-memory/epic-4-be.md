---
epic: 4
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/services/postScreening.service.ts, apps/backend/src/tests/postScreening.test.ts, apps/backend/src/controllers/candidates.controller.ts, apps/backend/src/routes/candidates.ts, apps/backend/src/middleware/upload.ts, apps/backend/src/app.ts]
---

Date: 2026-05-10
Epic: 4
Phase: 2.0-complete

## Routes Implemented
POST /candidates/:id/post-screen — postScreenCandidateHandler (uploadTranscriptFile middleware; calls runPostScreening; upserts PostScreening; status=decided)
POST /candidates/:id/decision   — recordDecisionHandler (Zod-like validation; calls recordDecision; computes isOverride; logs F-11)

## Database Models
No schema changes. PostScreening + PostScreeningDecision enum already existed in epic_2_candidate_management migration.
PostScreening: id, candidateId (unique FK cascade), transcriptFileName?, aiRecommendation?, recruiterChoice?, isOverride?, reasoningJson?, createdAt, updatedAt

## Migrations
None — Epic 2 migration already contains all required fields.

## Test Results
Integration: 43 passed, 0 failed (5 test files — 13 new post-screening tests + 30 prior)
- postScreening.test.ts: 13 new tests (404, 400, 409, 200x2, upsert/re-run, 502, decision 404/409/400/confirm/override, service unit)
- screening.test.ts: 7 tests — all still pass
- candidates.test.ts: 14 tests — all still pass
- auth.test.ts: 9 tests — all still pass
- health.test.ts: 1 test — pass

## Env Vars Required
ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN, NODE_ENV

## Key Implementation Notes
- postScreening.service.ts: runPostScreening(candidateId, transcriptFile) — reads transcript from disk, calls claude-sonnet-4-6, upserts PostScreening + sets status=decided in Prisma $transaction; re-run clears recruiterChoice + isOverride
- postScreening.service.ts: recordDecision(candidateId, choice) — computes isOverride server-side; logs [DECISION] audit line per F-11
- F-11 audit: [POST-SCREEN] logged after successful upsert; [DECISION] logged after successful recruiter decision update
- uploads/transcript/ directory created in app.ts mkdirSync at startup alongside cv/linkedin
- uploadTranscriptFile multer instance: diskStorage to uploads/transcript/, single("transcript"), 10 MB limit, text/plain only
- stripJsonFences() defined locally in postScreening.service.ts (no cross-service export needed per file structure)
- Test mock strategy: mockResolvedValueOnce chaining for pre-screen then post-screen calls within same test; avoids shape mismatch between the two Claude response formats

## What FE Agent Needs
- POST /candidates/:id/post-screen: multipart/form-data with "transcript" field; returns PostScreening record shape: { id, candidateId, transcriptFileName, aiRecommendation, recruiterChoice, isOverride, reasoningJson, createdAt, updatedAt }
- POST /candidates/:id/decision: JSON body { choice: "pass" | "no_pass" }; returns updated PostScreening record with isOverride computed
- reasoningJson is a raw JSON string — parse client-side: { reasoning: string, keyFindings: Array<{type, description, relatedQuestion}>, confidenceScore: number }
- 400 if no transcript file; 404 if candidate not found; 409 if no preScreening exists; 502 on Anthropic failure
- GET /candidates/:id already returns postScreening relation fully populated — no extra API call needed for page-refresh recovery

## Deviations from design.md
- Mock strategy uses mockResolvedValueOnce chaining (not described in design) — necessary because both pre-screen and post-screen share the same Anthropic SDK mock within the test file
- [EPIC-2][LOW] CandidateDetailsCard file link href fix is FE-only — skipped per agent scope boundary (BE agent does not touch apps/frontend)
