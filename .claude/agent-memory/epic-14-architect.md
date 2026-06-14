---
epic: 14
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-14.md]
---

Date: 2026-05-21
Phase: 1.0-complete

## Summary
Epic 14 implements F-32: add a second CloudFront distribution as an HTTPS proxy in front
of the Lightsail backend to fix mixed-content blocking. The frontend is served over HTTPS
but VITE_API_URL currently points to plain HTTP — browsers block all API calls. Fix is
Terraform-only: new `cloudfront_api.tf` resource + update two GitHub secrets + redeploy.
No FE or BE application code changes.

## API Endpoints
No changes. All endpoints unchanged.

## Database Models
No changes. Schema unchanged.

## Anthropic Call Points
No changes. Unchanged from prior epics.

## Infrastructure
Frontend: AWS S3 (solo-mode-frontend-995603457880) + CloudFront d3a8iu1mf8poh.cloudfront.net — unchanged
Backend: AWS Lightsail 52.86.93.139:3000 — unchanged
API CloudFront: NEW aws_cloudfront_distribution.api — HTTPS proxy in front of Lightsail
  - Origin: 52.86.93.139.nip.io port 3000 (HTTP-only, matches existing pattern)
  - CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad (CachingDisabled managed)
  - OriginRequestPolicyId: b689b0a8-53d0-40ab-baf2-68738e2966ac (AllViewerExceptHostHeader)
  - origin_read_timeout: 60s (matches existing distribution)
  - PriceClass_100
Database: Supabase PostgreSQL — unchanged
IaC: Terraform — remote backend unchanged (gorilla-tf-state-995603457880)

## New Files
infrastructure/terraform/cloudfront_api.tf — new API CloudFront distribution resource

## Modified Files
infrastructure/terraform/outputs.tf — append api_cloudfront_domain output

## Required Env Vars
VITE_API_URL: update to https://<api_cloudfront_domain> after terraform apply
CORS_ORIGIN: verify/set to https://d3a8iu1mf8poh.cloudfront.net (likely unchanged)

## Deviations from BRD
F-32 is amendments.md only — no BRD rows for Epic 14. No deviations from amendment spec.
