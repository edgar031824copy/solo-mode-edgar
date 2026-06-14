---
epic: 13
agent: devops
status: complete
phase: 5.0-complete
outputs: [infrastructure/terraform/, .github/workflows/deploy.yml, .github/workflows/terraform-provision.yml, .github/workflows/terraform-destroy.yml, docs/deployment.md]
---

Date: 2026-05-21
Phase: epic=13,phase=5.0-complete

## Deploy Mode: infrastructure migration (F-31)

## Migration Summary
Migrated all infrastructure from personal AWS account (503561459070) to company AWS account (995603457880) with OIDC auth replacing static AWS keys.

## What Was Completed
(a) Pre-check: OIDC trust relationship confirmed working on gorillalogic/edgar-solo-mode
(b-d) Terraform: backend "s3" block added (gorilla-tf-state-995603457880), runner_registration_token variable, self-hosted runner bootstrap in user_data
(e) terraform-provision.yml created (runs-on: self-hosted — company billing blocks GitHub-hosted for this workflow)
(f) terraform-destroy.yml created (confirm input required)
(g) deploy.yml updated: deploy-frontend uses OIDC (aws-actions/configure-aws-credentials@v4), static AWS key env vars removed
(h) All changes committed and pushed; terraform-provision.yml triggered and succeeded
(i) New infrastructure provisioned on company account 995603457880
(j) Static AWS key secrets deleted; 5 secrets updated (FRONTEND_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, VITE_API_URL, AWS_UPLOADS_BUCKET, LIGHTSAIL_HOST)
(k) Multiple deploy iterations fixed PM2 systemd management, OOM swap, PATH issues
(l) restart_only mode added to deploy.yml (recovers PM2 after OOM without npm ci)
(m) node_modules caching added to deploy.yml (prevents future OOM after cache warms up)
(n) Backend verified HTTP 200, frontend verified HTTP 200 with <div id="root">

## Live URL
https://d3a8iu1mf8poh.cloudfront.net

## Services (Company Account: 995603457880)
- Frontend: AWS S3 bucket solo-mode-frontend-995603457880 + CloudFront d3a8iu1mf8poh.cloudfront.net
- Backend: AWS Lightsail 52.86.93.139:3000 (nano_2_0, 512MB RAM + 1GB swap)
- Runner: Self-hosted GitHub Actions runner on same Lightsail instance
- Database: Supabase (unchanged — shared between personal and company accounts)

## Known Issues
- npm ci on cold cache takes 60-80 min on 512MB instance; warms after 2-3 runs → 5-6 min
- restart_only workflow_dispatch available to recover PM2 after OOM without full deploy
- Old runner on personal account (34.226.38.150) should be deregistered by Andres

## Teardown
Trigger terraform-destroy.yml with confirm=destroy
