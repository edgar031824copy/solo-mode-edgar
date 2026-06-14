---
epic: 8
agent: techlead
status: complete
phase: 3.0-complete
outputs: [docs/review-report-epic-8.md]
---

Date: 2026-05-14
Epic: 8
Phase: 3.0-complete

## Sign-off: APPROVED

Epic 8 (Amendment F-26) — CI/CD deploy fix — fully reviewed and approved.
Single file changed: `.github/workflows/deploy.yml`. No application code changes.
Both deploy.yml changes conform exactly to design-epic-8.md.

## Tests Run
Vitest BE: 120 passed, 0 failed (14 files)
Vitest FE: 54 passed, 0 failed (11 files)
Total: 174 passed, 0 failed

## Deploy.yml Checklist
- appleboy/ssh-action: removed — PASS
- git pull: removed — PASS
- rsync -avz --delete with correct source (apps/backend/) and destination — PASS
- SSH key written at runtime from LIGHTSAIL_SSH_KEY secret — PASS
- SSH heredoc: set -e, 9 env exports, npm ci, build, prisma, pm2 restart/save — PASS
- ENDSSH terminator at column 0 after YAML block scalar stripping — PASS
- deploy-frontend needs: [test-backend, test-frontend, deploy-backend] — PASS
- YAML syntax: no tabs, structure valid — PASS

## Prior Issue Fixes
No [HIGH] or [MEDIUM] issues carried forward into Epic 8.
All prior [HIGH]/[MEDIUM] issues were resolved by Epic 7 or earlier.

## Known Issues
- [EPIC-8][LOW] BE: getCandidateFilePath() in candidates.service.ts returns unused filePath (disk path); only result.fileName (S3 key) is consumed by controller post-F-24. Dead code — cleanup in future pass.
- [EPIC-8][LOW] BE: AWS SDK v3 emits NodeVersionSupportWarning for Node < 22. Harmless; Lightsail targets Node 22 LTS in production.
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no on SSH/rsync steps. Acceptable for current scale; address if compliance requirements tighten.
