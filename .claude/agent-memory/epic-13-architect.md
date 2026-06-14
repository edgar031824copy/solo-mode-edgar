---
epic: 13
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-13.md]
---

Date: 2026-05-19
Phase: 1.0-complete

## Summary
Epic 13 implements F-31: full infrastructure migration from personal AWS account
(503561459070) to company AWS account (995603457880) and replacement of static IAM
credentials in GitHub Actions with OIDC. No FE or BE application code changes.

## API Endpoints
No changes. All endpoints unchanged.

## Database Models
No changes. Schema unchanged.

## Anthropic Call Points
No changes. Unchanged from prior epics.

## Infrastructure
Frontend: AWS S3 (solo-mode-frontend-995603457880) + CloudFront — new account, same topology
Backend: AWS Lightsail solo-mode-api — new instance in company account, self-hosted GHA runner auto-registered at boot
Database: Supabase PostgreSQL — unchanged (same connection string)
IaC: Terraform — remote backend added (gorilla-tf-state-995603457880 / solo-mode/terraform.tfstate)
Auth (CI/CD): OIDC — arn:aws:iam::995603457880:role/gha-aisdlc-deploy-role (replaces static keys)

## Required Env Vars
Existing: DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, AWS_REGION, AWS_UPLOADS_BUCKET
Secrets to DELETE: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
Secrets to UPDATE: FRONTEND_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, VITE_API_URL
New Terraform var (not a GitHub secret): runner_registration_token (workflow input only, not committed)

## New Files
.github/workflows/terraform-provision.yml — workflow_dispatch, GitHub-hosted, OIDC, terraform apply
.github/workflows/terraform-destroy.yml — workflow_dispatch with confirm=destroy gate, OIDC, terraform destroy

## Modified Files
infrastructure/terraform/main.tf — add backend "s3" block
infrastructure/terraform/variables.tf — add runner_registration_token variable
infrastructure/terraform/lightsail.tf — add runner binary download + config.sh + svc.sh install block after PM2
.github/workflows/deploy.yml — deploy-frontend: add OIDC step, remove static key env vars, add job-level permissions

## Execution Order (DevOps agent)
(a) pre-check OIDC role IAM permissions → (b-g) file changes → (h) commit+push →
(i) generate runner token → (j) trigger terraform-provision.yml → (k) poll health →
(l) update 5 GitHub secrets → (m) no-op push to verify runner → (n) deregister old runner →
(o) end-to-end smoke test

## Deviations from BRD
F-31 is amendments.md only — no BRD rows for Epic 13.
