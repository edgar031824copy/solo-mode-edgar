---
epic: 12
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-12.md]
---

Date: 2026-05-19
Phase: 1.0-complete

## Summary
Epic 12 implements F-30: fix polling bug in CandidateDetailPage where fetchCandidate()
called setLoading(true) on every invocation, causing React to render the skeleton guard,
unmount the active tab, and fire its stopPolling() cleanup — permanently killing the
polling interval. Fix: add silent=false parameter; polling refreshes pass silent=true
to skip both setLoading calls and avoid unmounting tabs.

## API Endpoints
No changes. All endpoints unchanged from Epic 11.

## Database Models
No changes. Schema unchanged from Epic 11.

## Anthropic Call Points
No changes. Unchanged from prior epics.

## Infrastructure
Frontend: AWS S3 + CloudFront — unchanged
Backend: AWS Lightsail, PM2 — unchanged
Database: Supabase PostgreSQL — unchanged
IaC: Terraform — unchanged

## Required Env Vars
No new env vars. DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY,
AWS_UPLOADS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.

## Changed Files
apps/frontend/src/pages/CandidateDetailPage.tsx — only file changed

## Change Summary
fetchCandidate(silent = false): add silent param; guard setLoading(true) and
setLoading(false) in .finally with if (!silent). Pass () => fetchCandidate(true) as
onRefresh to both PreScreeningTab and PostScreeningTab. Initial useEffect call unchanged
(no argument = shows skeleton). No changes to any other file.

## Deviations from BRD
F-30 is amendments.md only — no BRD rows for Epic 12.
