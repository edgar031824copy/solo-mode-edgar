---
epic: 10
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-10.md]
---

Date: 2026-05-15
Phase: 1.0-complete

## Summary
Epic 10 is a test isolation fix only (Amendment F-28). No production code, schema, API
endpoints, or infrastructure changes. Three application files changed + two agent definition
files updated to add local test DB prerequisite before every npm test invocation.

## API Endpoints
None — no new or changed endpoints.

## Database Models
None — no schema changes.

## Anthropic Call Points
None.

## Infrastructure
Frontend: AWS S3 + CloudFront — unchanged
Backend: AWS Lightsail, PM2 — unchanged
Database: Supabase PostgreSQL (prod) + postgresql://localhost/recruitment_test (test) — test DB added
IaC: Terraform — unchanged

## Required Env Vars
No new secrets. DATABASE_URL in .env.test is postgresql://localhost/recruitment_test (no credentials, safe to commit).

## Files Changed
- apps/backend/.env.test — create; DATABASE_URL=postgresql://localhost/recruitment_test
- apps/backend/src/tests/setup-env.ts — create; loads .env.test first then .env via dotenv config()
- apps/backend/vitest.config.ts — modify; setupFiles from "dotenv/config" to "./src/tests/setup-env.ts"
- .claude/agents/04-techlead-agent.md — add createdb + prisma migrate deploy prerequisite to Step 3
- .claude/agents/05-qa-agent.md — add createdb + prisma migrate deploy prerequisite to Step 2

## Local Test DB Prerequisite (must run before npm test)
cd apps/backend && createdb recruitment_test 2>/dev/null || true
DATABASE_URL=postgresql://localhost/recruitment_test npx prisma migrate deploy

## Deviations from BRD
F-28 is an amendments.md item only — no BRD rows for Epic 10.
