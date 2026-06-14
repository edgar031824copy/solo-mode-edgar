---
epic: 5
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-5.md]
---

Date: 2026-05-10
Phase: 1.0-complete

## API Endpoints
GET /candidates/:id/report — return full candidate JSON report (candidate + preScreening + postScreening); auth required

## Database Models
No new models. No new migration. All existing models (Recruiter, Candidate, PreScreening, PostScreening) are unchanged.

## Anthropic Call Points
None in Epic 5. Existing call points remain:
- POST /candidates/:id/pre-screen → screening.service.ts (pre-screening)
- POST /candidates/:id/post-screen → postScreening.service.ts (post-screening)
Epic 5 adds prompt caching (cache_control: ephemeral) to both service system prompts — no new Anthropic calls.

## Infrastructure
Frontend: AWS S3 + CloudFront (unchanged)
Backend: AWS Lightsail + PM2 (unchanged)
Database: Supabase free tier (unchanged)
IaC: Terraform (unchanged)

## Required Env Vars
No new env vars. Existing set suffices: DATABASE_URL, JWT_SECRET, PORT, ANTHROPIC_API_KEY, CORS_ORIGIN, NODE_ENV

## Key Design Decisions
- F-12 report export: GET /candidates/:id/report returns JSON; client-driven download via Blob + URL.createObjectURL; no Content-Disposition header on server; filename = candidate-<id>-report.json
- preScreening.redFlagsJson and interviewQuestionsJson parsed server-side in getCandidateReport(); parse failures return empty arrays + warn log
- postScreening.reasoningJson parsed server-side; parse failure returns null (not an error)
- NF-07 logging: replace logger.ts stub with pino; thin adapter preserves existing (msg, meta?) call signature at all existing call sites — zero refactor required
- pino-pretty as devDependency; used only when NODE_ENV !== "production"
- Request-level middleware added in app.ts on res.on("finish"); logs method, path, candidateId (if present), statusCode, duration_ms
- Anthropic call timing logged in both screening.service.ts and postScreening.service.ts
- [EPIC-4][LOW] fix: cache_control added to system block in both Anthropic service files while adding logging

## FE Changes
- CandidateDetailPage: add "Download Report" button (shadcn Button variant=outline, lucide Download icon)
- api.ts: add downloadReport(candidateId) function → GET /candidates/:id/report
- State: reportLoading + reportError (local useState in CandidateDetailPage; no new context)

## Deviations from BRD
- PDF export not implemented — BRD F-12 lists "PDF or JSON"; JSON is the required deliverable, PDF is explicitly marked optional stretch goal. JSON-only implementation satisfies the requirement.
