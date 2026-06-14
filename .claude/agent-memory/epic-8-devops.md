---
epic: 8
agent: devops
status: complete
phase: 5.0-complete
outputs: [.github/workflows/deploy.yml (committed + pushed)]
---

Date: 2026-05-14
Phase: epic=8,phase=5.0-complete

## Deploy Mode: post-launch

## Commit
b71fb26edd6495952866b9dfe40308b54459c083
Message: "fix(ci): replace git pull with rsync for Lightsail BE deploy, gate FE on BE (F-26)"

## Push Confirmation
Pushed to origin/main successfully. GitHub Actions deploy workflow triggered.

## Live URL
https://d36qh2h56p23nc.cloudfront.net

## Pre-deploy Health Check
Backend: http://34.226.38.150:3000/health
Result: {"status":"ok","timestamp":"2026-05-14T23:47:10.059Z"} — 200 OK

## Changes in This Deploy

F-26 Part 1 — Lightsail deploy method replaced:
- Removed: appleboy/ssh-action + git pull (fatal: not a git repository)
- Added: native rsync -avz --delete to push backend files from CI runner to Lightsail
- Added: native SSH heredoc for post-deploy commands (npm ci, prisma generate/migrate, pm2 restart)

F-26 Part 2 — Sequential deploy DAG enforced:
- deploy-frontend now needs: [test-backend, test-frontend, deploy-backend]
- If deploy-backend fails, deploy-frontend is automatically skipped (not failed)
- Production frontend is never updated with a broken or mismatched backend

## What CI Will Do When Triggered
1. test-backend — npm ci, prisma migrate, prisma db seed, vitest (120 tests)
2. test-frontend — npm ci, vitest (54 tests)
3. deploy-backend — rsync apps/backend/ to 34.226.38.150:/home/ubuntu/solo-mode/apps/backend/
   then SSH: npm ci --omit=dev, npm run build, prisma generate, prisma migrate deploy, pm2 restart
4. deploy-frontend — (waits for deploy-backend) builds React SPA, syncs to S3, invalidates CloudFront

## Secrets Required (all exist from Epic 6)
- LIGHTSAIL_HOST, LIGHTSAIL_SSH_KEY, DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
- CORS_ORIGIN, AWS_UPLOADS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
- FRONTEND_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, VITE_API_URL
