---
epic: 11
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-11.md, .claude/agent-memory/epic-11-architect.md]
---

Date: 2026-05-15
Phase: 1.0-complete

## Summary
Epic 11 implements F-29: async pre/post-screening to eliminate CloudFront 60s timeout.
Both screening endpoints now return 202 immediately and run Claude in the background.
Frontend polls GET /candidates/:id every 3s until status advances or error is set.

## API Endpoints
POST /candidates/:id/pre-screen — changed: returns 202 immediately, fire-and-forget Claude call
POST /candidates/:id/post-screen — changed: returns 202 immediately, fire-and-forget Claude call
GET /candidates/:id — updated: response now includes preScreeningError field

## Database Models
Candidate: +preScreeningError String? (new optional field; written on background job failure)

## Migrations
npx prisma migrate dev --name epic11_prescreening_error
Single ALTER TABLE candidates ADD COLUMN "preScreeningError" TEXT

## BE Changes
candidates.controller.ts: preScreenCandidateHandler + postScreenCandidateHandler rewritten
  — sync validation (404/400) → clear preScreeningError → res.status(202) → void runAsync()
  — new helpers runPreScreeningAsync / runPostScreeningAsync (exported for test access)
  — on job failure: prisma.candidate.update({ preScreeningError: message })
screening.service.ts: no changes
postScreening.service.ts: no changes
candidates.service.ts: verify getCandidateById returns preScreeningError (no explicit select omitting it)

## FE Changes
lib/types.ts: CandidateDetail.preScreeningError: string | null  (new field)
PreScreeningTab.tsx: new 'polling' state replaces 'loading'; useRef interval every 3s;
  useEffect watches candidate prop — stops on status===pre_screened or preScreeningError set
PostScreeningTab.tsx: new 'polling' state replaces 'uploading'; same polling pattern;
  stops on status===decided or preScreeningError set
Spinner UI: Loader2 + "Analyzing..." text during polling
Error UI: existing destructive Alert; message from candidate.preScreeningError

## Anthropic Call Points
POST /candidates/:id/pre-screen → background runPreScreening (unchanged Claude logic)
POST /candidates/:id/post-screen → background runPostScreening (unchanged Claude logic)

## Infrastructure
Frontend: AWS S3 + CloudFront — unchanged
Backend: AWS Lightsail, PM2 — unchanged
Database: Supabase PostgreSQL — one new nullable column
IaC: Terraform — unchanged

## Required Env Vars
No new env vars. Same as prior epics: DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY,
AWS_UPLOADS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.

## Deviations from BRD
F-29 is amendments.md only — no BRD rows for Epic 11.
postScreeningError field was not added per amendment spec (shared preScreeningError field
used for both job types — simpler schema, FE clears on each new run).
