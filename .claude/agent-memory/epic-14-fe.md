---
epic: 14
agent: fe
status: complete
phase: 2.1-complete
outputs: []
---

Date: 2026-05-21
Epic: 14
Phase: 2.1-complete

## Summary
No FE changes for this epic — Terraform-only amendment F-32.

`docs/design-epic-14.md` explicitly states: "Scope: Terraform only — no FE or BE application code changes."
Epic 14 adds a second CloudFront distribution as an HTTPS proxy in front of the Lightsail backend
to resolve mixed-content blocking. The only post-deploy FE impact is that `VITE_API_URL` (a GitHub
secret) will be updated from `http://52.86.93.139:3000` to `https://<api_cloudfront_domain>` —
this requires a frontend re-deploy (rebuild with new secret), not a code change.

## Components Built
None — Terraform-only epic.

## Routes
No new routes.

## API Endpoints Consumed
No new endpoints.

## Test Results
Unit: 58 passed, 0 failed (11 files — no change from Epic 13)

## Known Issues Addressed
- [EPIC-13][MEDIUM] INFRA: terraform.tfvars with live secrets — infra/git concern only, no FE code action required.
- [EPIC-11][LOW] FE: 3s polling interval hardcoded — carried forward, no action needed this epic.

## Deviations from design-epic-14.md
None — design doc requires no FE implementation work.
