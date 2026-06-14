---
epic: 8
agent: be
status: complete
phase: 2.0-complete
outputs: [.github/workflows/deploy.yml]
---

Date: 2026-05-14
Epic: 8
Phase: 2.0-complete

## Summary

Amendments-only epic. No backend application code, schema, or endpoint changes.
Single file modified: `.github/workflows/deploy.yml`.

## Routes Implemented

None — this epic contains no new or changed API routes.

## Database Models

None — no schema changes in this epic.

## Migrations

None.

## Changes Made

### Change 1 — Replace `appleboy/ssh-action` with native rsync + SSH in `deploy-backend`

Problem: Lightsail instance has no git repo (`/home/ubuntu/solo-mode` was bootstrapped via
`scp`, never `git clone`). `git pull origin main` fails with "fatal: not a git repository".

Fix: Two native `run:` steps replace the single `appleboy/ssh-action@v1` step:
- Step "Write SSH key and rsync backend files": writes `LIGHTSAIL_SSH_KEY` secret to
  `~/.ssh/lightsail_key`, then runs `rsync -avz --delete` to push `apps/backend/` from
  the CI runner's checked-out tree to `ubuntu@LIGHTSAIL_HOST:/home/ubuntu/solo-mode/apps/backend/`.
- Step "Run post-deploy commands on Lightsail": SSH heredoc runs `npm ci --omit=dev`,
  `npm run build`, `npx prisma generate`, `npx prisma migrate deploy`, PM2 restart/start,
  `pm2 save`. Secrets injected as `export` statements inside the heredoc body — evaluated
  by GitHub Actions on the runner before SSH, so values arrive as literal strings on the
  remote (this is the correct pattern; appleboy env: does not propagate into remote shell).

### Change 2 — Gate `deploy-frontend` on `deploy-backend`

Problem: Both deploy jobs ran in parallel after tests passed. A failed `deploy-backend`
did not prevent `deploy-frontend` from proceeding, leaving production in a split state
(new FE calling stale/broken BE).

Fix: `deploy-frontend` `needs:` changed from `[test-backend, test-frontend]` to
`[test-backend, test-frontend, deploy-backend]`. GitHub Actions skips `deploy-frontend`
automatically if `deploy-backend` fails — S3 bucket is not updated, production FE unchanged.

## Test Results

No integration tests written — this epic modifies only CI/CD YAML, not application code.
Existing backend test suite: 120 passed, 0 failed (carried forward from epic 7).

## Env Vars Required

All secrets already exist from Epic 6: LIGHTSAIL_HOST, LIGHTSAIL_SSH_KEY, DATABASE_URL,
JWT_SECRET, ANTHROPIC_API_KEY, CORS_ORIGIN, AWS_UPLOADS_BUCKET, AWS_REGION,
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, FRONTEND_BUCKET, CLOUDFRONT_DISTRIBUTION_ID,
VITE_API_URL.

## Deviations from design.md

None. Both changes implemented verbatim per design-epic-8.md § CI/CD Pipeline Fix.
