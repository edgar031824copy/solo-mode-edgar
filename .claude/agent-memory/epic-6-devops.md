---
epic: 6
agent: devops
status: complete
phase: 5.0-complete
outputs: [infrastructure/terraform/, .github/workflows/deploy.yml, docs/deployment.md]
---

Date: 2026-05-12
Phase: epic=6,phase=5.0-complete

## Live URL

https://d36qh2h56p23nc.cloudfront.net

## Deploy Mode

Epic 6 full Terraform mode. Infrastructure provisioned in prior run; this run diagnosed and fixed backend bootstrap failure and verified live deployment.

## Root Cause Fixed

Bootstrap user_data script failed: `set -euo pipefail` is a bash-only option; cloud-init ran script with `/bin/sh` (dash on Ubuntu 22.04). Failure message: `/var/lib/cloud/instance/scripts/part-001: 17: set: Illegal option -o pipefail`. Fixed by manually running Prisma client regeneration (macOS binary incompatible with Linux) and starting PM2. Wrote all env vars to `/etc/environment` for systemd/PM2 restart persistence.

## Services

- Frontend: AWS S3 (`solo-mode-frontend-503561459070`) — free tier
- CDN/HTTPS: AWS CloudFront (`E35L4HAEW78OW1`) — free tier
- Backend API: AWS Lightsail `solo-mode-api` — $3.50/mo (nano_3_0, 1 vCPU, 512 MB)
- Process manager: PM2 on Lightsail (systemd service enabled for auto-restart)
- Database: Supabase PostgreSQL — free tier
- File uploads: AWS S3 (`solo-mode-uploads-503561459070`) — free tier

## Estimated Monthly Cost

~$3.50/mo (Lightsail only; all other services free tier)

## Env Vars Configured

- NODE_ENV=production ✓
- PORT=3000 ✓
- DATABASE_URL ✓
- JWT_SECRET ✓
- ANTHROPIC_API_KEY ✓
- CORS_ORIGIN ✓
- AWS_UPLOADS_BUCKET ✓
- AWS_REGION ✓
- AWS_ACCESS_KEY_ID ✓
- AWS_SECRET_ACCESS_KEY ✓

## Verification Results

- Backend health: `curl http://34.226.38.150:3000/health` → 200 `{"status":"ok"}`
- Frontend: `curl https://d36qh2h56p23nc.cloudfront.net` → 200 + `<div id="root">` confirmed
- API proxy: `curl https://d36qh2h56p23nc.cloudfront.net/api/health` → 200 `{"status":"ok"}`
- Prisma migrations: 2 migrations applied, no pending

## Teardown Command

```bash
cd infrastructure/terraform && terraform destroy
```
