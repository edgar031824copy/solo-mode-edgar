---
epic: 3
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-3.md]
---

Date: 2026-05-10
Phase: 1.0-complete

## API Endpoints
POST /candidates/:id/pre-screen — trigger Anthropic analysis; upserts PreScreening record; sets Candidate.status=pre_screened
GET  /candidates/:id            — unchanged from Epic 2; preScreening relation now populated

## Database Models
No new models. No new migration. Epic 2 migration already defines all needed fields.
PreScreening: id, candidateId (unique FK, cascade), profileSummary?, redFlagsJson?, interviewQuestionsJson?, overallFit? — unchanged schema

## Anthropic Call Points
POST /candidates/:id/pre-screen → pre-screening (screening.service.ts → runPreScreening())
Model: claude-sonnet-4-6, max_tokens: 2048
System prompt: fixed constant (never interpolated)
User prompt: injects cvText, linkedinText, candidate.position
Output: JSON with profileSummary (string), redFlags (array), interviewQuestions (array of 5), overallFit (int 1–5)
redFlags and interviewQuestions stored as JSON.stringify() strings in DB

## Key Design Decisions
- No schema migration needed — PreScreening model fully defined in Epic 2 migration
- candidate.position (String?) is the target position field; null = "unspecified role" in prompt
- Endpoint is idempotent (upsert) — re-running overwrites existing PreScreening record
- Claude system prompt is a fixed constant; variable data in user-turn only
- 400 if both cvFileName and linkedinFileName are null (nothing to analyze)
- 502 on JSON.parse failure or missing required fields — partial record never written
- FE PreScreeningTab: 4 states (idle / loading / error / done); onRefresh callback prop triggers parent re-fetch
- FE JSON parsing of redFlagsJson and interviewQuestionsJson done client-side with try/catch
- E2E tests skip if ANTHROPIC_API_KEY not set

## Infrastructure
Frontend: AWS S3 + CloudFront (unchanged)
Backend: AWS Lightsail + PM2 (unchanged); screening.service.ts added to existing src/services/
Database: Supabase free tier (unchanged)
IaC: Terraform (unchanged)

## Required Env Vars
ANTHROPIC_API_KEY (already present from Epic 1 scaffold — no new vars)

## Known Issue Fixed in Epic 3
[EPIC-2][MEDIUM] FE: api.ts 401 interceptor must exclude /auth/login path — fix before new feature code

## Deviations from BRD
None
