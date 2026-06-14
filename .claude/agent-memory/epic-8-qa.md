---
epic: 8
agent: qa
status: complete
phase: 4.0-complete
outputs: [docs/brd-coverage-epic-8.md]
---

Epic: 8
Date: 2026-05-14
Phase: 4.0-complete

## Result: PASS — 100% (1/1 amendments)

Epic 8 is a CI/CD-only amendments epic. No BRD F-IDs. One amendment in scope: F-26.
QA approach: static analysis of .github/workflows/deploy.yml + regression test suite.

## Amendment Coverage

F-26 (1/1 = 100%):
- Part 1 (rsync): git pull absent, appleboy/ssh-action absent, rsync -avz --delete present (line 166),
  SSH key setup present (mkdir ~/.ssh, echo secret, chmod 600), SSH heredoc with ENDSSH present,
  post-deploy steps: npm ci --omit=dev, prisma generate, prisma migrate deploy, pm2 restart/save.
- Part 2 (sequential FE deploy): deploy-frontend needs: [test-backend, test-frontend, deploy-backend] confirmed (line 101).

## Non-Functional Coverage

No NF requirements in scope for Epic 8 (CI/CD fix only).
Prior NF coverage remains in effect from Epics 1–7.

## Regression Tests

Backend (Vitest): 120/120 passed (14 files)
Frontend (Vitest): 54/54 passed (11 files)
Total: 174/174 — all green

## Known Defects

- [LOW] getCandidateFilePath() in candidates.service.ts has unused filePath return value (dead code, pre-existing)
- [LOW] AWS SDK v3 NodeVersionSupportWarning for Node 20 (harmless; Lightsail uses Node 22 in prod)
- [LOW] StrictHostKeyChecking=no on SSH/rsync steps (acceptable for current scale)

## Playwright Report

No Playwright tests for this epic — no application behavior changed.
