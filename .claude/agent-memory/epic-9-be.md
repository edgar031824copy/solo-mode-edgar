---
epic: 9
agent: be
status: complete
phase: 2.0-complete
outputs: [.github/workflows/deploy.yml, apps/backend/package.json, apps/backend/package-lock.json, .claude/agents/06-devops-agent.md]
---

Date: 2026-05-15
Phase: 2.0-complete

## Changes Made

F-27.1 — Added Node.js setup + build steps to `deploy-backend` job in deploy.yml (actions/setup-node@v4, npm ci, npm run build) before rsync. TypeScript is now compiled on the CI runner; a tsc failure aborts the job before any files are transferred to Lightsail.

F-27.2 — Added `--exclude='node_modules'` to the rsync invocation in deploy.yml. Prevents ~50k binary files from being transferred; Lightsail installs its own clean prod deps via npm ci --omit=dev after rsync.

F-27.3 — Moved `prisma` CLI from devDependencies to dependencies in apps/backend/package.json. Regenerated package-lock.json via npm install. `npx prisma generate` and `npx prisma migrate deploy` now work after `npm ci --omit=dev` on Lightsail.

F-27.4 — Patched .claude/agents/06-devops-agent.md to require staging `docs/.phase`, `amendments.md`, and `.claude/agent-memory/` in the same commit as the application change. No loose working-tree state after post-launch deploys.

## Files Modified
- .github/workflows/deploy.yml — deploy-backend job restructured
- apps/backend/package.json — prisma moved to dependencies
- apps/backend/package-lock.json — regenerated after package.json change
- .claude/agents/06-devops-agent.md — F-27.4 framework state commit instruction added

## Known Issues
None
