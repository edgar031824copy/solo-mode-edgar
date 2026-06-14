---
epic: 9
agent: devops
status: complete
phase: 5.0-complete
outputs: [commit pushed to main, CI/CD verified]
---

Date: 2026-05-15
Phase: epic=9,phase=5.0-complete

## Deploy Mode: post-launch

## Summary
Epic 9 (F-27) ships CI/CD fixes only — no schema/UI/API changes. Changes:
- `.github/workflows/deploy.yml` — TypeScript compiled on CI runner (with prisma generate before tsc); node_modules excluded from rsync
- `apps/backend/package.json` — prisma moved from devDependencies to dependencies
- `apps/backend/package-lock.json` — regenerated
- `.claude/agents/06-devops-agent.md` — F-27.4 patch: always commit framework state files

Two fix commits were required after the main F-27 commit:
1. YAML syntax: ENDSSH terminator was at column 0; moved back to 10-space indent
2. Deploy-backend tsc: prisma generate step missing before npm run build; added

## Commits
- 4826b0b — fix(ci): compile TS on CI runner before rsync, exclude node_modules, move prisma to deps (F-27)
- 360ce4a — fix(ci): fix YAML syntax error — indent ENDSSH terminator to match block scalar level
- 022bc83 — fix(ci): add prisma generate before tsc in deploy-backend job (final HEAD)

## CI/CD
GitHub Actions run ID: 25924191648
URL: https://github.com/gorillalogic/edgar-solo-mode/actions/runs/25924191648
Result: success — all 4 jobs passed
- Frontend Tests: success (40s)
- Backend Tests: success (78s)
- Deploy Backend (Lightsail): success (98s)
- Deploy Frontend (S3 + CloudFront): success (29s)

## Live URL
Frontend: https://d36qh2h56p23nc.cloudfront.net
Backend: http://34.226.38.150:3000
Health: http://34.226.38.150:3000/health

## Verification
Backend /health: HTTP 200
Frontend CloudFront: HTTP 200, <div id="root"> present

## Env Vars Configured
- DATABASE_URL ✓
- JWT_SECRET ✓
- ANTHROPIC_API_KEY ✓
- AWS_ACCESS_KEY_ID ✓
- AWS_SECRET_ACCESS_KEY ✓
- AWS_REGION ✓
- FRONTEND_BUCKET ✓
- CLOUDFRONT_DISTRIBUTION_ID ✓
- VITE_API_URL ✓
- LIGHTSAIL_HOST ✓
- LIGHTSAIL_SSH_KEY ✓
- CORS_ORIGIN ✓
- AWS_UPLOADS_BUCKET ✓

## Teardown Command
cd infrastructure/terraform && terraform destroy
