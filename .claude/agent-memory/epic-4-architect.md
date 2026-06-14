---
epic: 4
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-4.md]
---

Date: 2026-05-10
Phase: 1.0-complete

## API Endpoints
POST /candidates/:id/post-screen — upload transcript (multipart), call Anthropic, upsert PostScreening, set status=decided
POST /candidates/:id/decision   — record recruiter confirm/override choice; compute isOverride; log decision (F-11)
GET  /candidates/:id            — unchanged; postScreening relation now fully populated
GET  /candidates                — unchanged; recruiterChoice flatten already in place for F-14 badge

## Database Models
No new models. No new migration.
PostScreening: id, candidateId (unique FK cascade), transcriptFileName?, aiRecommendation (PostScreeningDecision?), recruiterChoice (PostScreeningDecision?), isOverride (Boolean?), reasoningJson (String?), createdAt, updatedAt — already in epic_2_candidate_management migration
PostScreeningDecision enum: pass | no_pass — already exists

## Anthropic Call Points
POST /candidates/:id/post-screen → post-screening (postScreening.service.ts → runPostScreening())
Model: claude-sonnet-4-6, max_tokens: 2048
System prompt: fixed constant; instructs JSON-only output with shape: { recommendation, reasoning, keyFindings, confidenceScore }
User prompt: injects transcriptText + preScreening context (redFlagsJson, interviewQuestionsJson) + position
reasoningJson stored as JSON.stringify({ reasoning, keyFindings, confidenceScore })

## Infrastructure
Frontend: AWS S3 + CloudFront (unchanged)
Backend: AWS Lightsail + PM2 (unchanged); uploads/transcript/ directory created at startup
Database: Supabase free tier (unchanged); no new migration
IaC: Terraform (unchanged)

## Required Env Vars
No new env vars. All vars from prior epics suffice: DATABASE_URL, JWT_SECRET, PORT, ANTHROPIC_API_KEY, CORS_ORIGIN, NODE_ENV

## Known Issues to Fix First
- [EPIC-2][LOW] FE: CandidateDetailsCard file link href missing VITE_API_URL prefix — fix before new feature code

## Key Design Decisions
- POST /candidates/:id/decision is a separate endpoint from /post-screen so AI analysis and human decision are independently logged (F-11 audit)
- isOverride computed server-side: recruiterChoice !== aiRecommendation; stored in DB so page refresh reflects correct label without client-side re-derivation
- Re-run /post-screen clears recruiterChoice + isOverride (null) so decided state is reset and recruiter must re-confirm after a fresh analysis
- Decision logging uses existing logger.ts (Winston/pino); no separate DecisionLog DB table needed — PostScreening record is the persistent audit trail
- PostScreeningTab has 5 states: idle / uploading / error / done-undecided / done-decided; done-decided survives page refresh via persisted DB fields
- FileDropZone reused for transcript upload (.txt only; 10 MB limit)
- No new Prisma types needed; CandidateDetail type in types.ts already has all postScreening fields

## Amendments Considered
F-24 (S3 file storage migration) — Target Epic 6; not in scope for Epic 4. Transcript files continue to use local disk storage.

## Deviations from BRD
None
