---
epic: 8
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-8.md]
---

Date: 2026-05-14
Phase: 1.0-complete

## Summary
Epic 8 is a CI/CD fix only (Amendment F-26). No production code, schema, endpoint, or FE changes.
Two bugs in deploy.yml: (1) git pull fails on Lightsail — instance was bootstrapped manually, never git cloned;
(2) deploy-frontend runs in parallel with deploy-backend — if BE fails, FE still deploys, breaking prod.

## Root Causes
1. Lightsail /home/ubuntu/solo-mode is not a git repo (bootstrapped via SCP in Epic 6, not git clone).
   git pull → "fatal: not a git repository".
2. deploy-frontend needs: [test-backend, test-frontend] — no dependency on deploy-backend.
   BE failure leaves FE deployed against a broken/outdated backend.

## Fixes Designed

### Fix 1 — Replace git pull with rsync in deploy-backend job
Remove: appleboy/ssh-action@v1 step (it cannot inject secrets into the remote shell environment)
Add Step 1: "Write SSH key and rsync backend files"
  - Write LIGHTSAIL_SSH_KEY secret to ~/.ssh/lightsail_key (chmod 600)
  - rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail_key"
      apps/backend/  ubuntu@LIGHTSAIL_HOST:/home/ubuntu/solo-mode/apps/backend/
Add Step 2: "Run post-deploy commands on Lightsail"
  - SSH heredoc: exports all env vars, cd to /home/ubuntu/solo-mode/apps/backend,
    npm ci --omit=dev, npm run build, prisma generate, prisma migrate deploy,
    pm2 restart ecosystem.config.cjs --update-env || pm2 start, pm2 save

### Fix 2 — Gate deploy-frontend on deploy-backend
Change deploy-frontend needs from:
  needs: [test-backend, test-frontend]
To:
  needs: [test-backend, test-frontend, deploy-backend]

## Files Changed
- .github/workflows/deploy.yml — only file changed

## API Endpoints
None — no new or changed endpoints.

## Database Models
None — no schema changes.

## Anthropic Call Points
None.

## Infrastructure
No new infrastructure. All services unchanged from Epic 6:
Frontend: AWS S3 + CloudFront (d36qh2h56p23nc.cloudfront.net)
Backend: AWS Lightsail (34.226.38.150:3000), PM2
Database: Supabase PostgreSQL
IaC: Terraform (unchanged)

## Required Env Vars
All secrets already exist in GitHub from Epic 6:
LIGHTSAIL_HOST, LIGHTSAIL_SSH_KEY, DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY,
CORS_ORIGIN, AWS_UPLOADS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
FRONTEND_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, VITE_API_URL

## Deviations from BRD
F-26 is an amendments.md item only — no BRD rows for Epic 8.
