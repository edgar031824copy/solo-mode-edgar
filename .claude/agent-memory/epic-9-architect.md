---
epic: 9
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-9.md]
---

Date: 2026-05-15
Phase: 1.0-complete

## Summary
Epic 9 is a CI/CD and package.json fix only (Amendment F-27). No production code, schema,
API endpoint, or FE changes. Four sub-tasks: compile TS on CI runner before rsync (F-27.1);
exclude node_modules from rsync (F-27.2); move prisma to dependencies (F-27.3);
DevOps agent always commits all framework state files in deploy commit (F-27.4).

## API Endpoints
None — no new or changed endpoints.

## Database Models
None — no schema changes.

## Anthropic Call Points
None.

## Infrastructure
Frontend: AWS S3 + CloudFront (d36qh2h56p23nc.cloudfront.net) — unchanged
Backend: AWS Lightsail (34.226.38.150:3000), PM2 — unchanged
Database: Supabase PostgreSQL — unchanged
IaC: Terraform — unchanged
CI/CD: .github/workflows/deploy.yml — deploy-backend job modified

## Required Env Vars
All secrets already exist in GitHub from Epic 6. No new secrets required.

## Files Changed
- .github/workflows/deploy.yml — deploy-backend job: add Node setup + npm ci + npm run build
  on CI runner; add --exclude='node_modules' to rsync; remove npm run build from SSH heredoc
- apps/backend/package.json — move "prisma": "^7.8.0" from devDependencies to dependencies
- apps/backend/package-lock.json — regenerate after package.json change (run npm install locally)
- .claude/agents/06-devops-agent.md — add instruction to stage docs/.phase, amendments.md,
  and .claude/agent-memory/ in same commit as application change before git push

## Deviations from BRD
F-27 is an amendments.md item only — no BRD rows for Epic 9.
