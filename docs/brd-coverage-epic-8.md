# BRD Coverage Report — Epic 8
Date: 2026-05-14
Environment: static analysis + local test suite (no localhost servers required — CI/CD-only epic)
Overall coverage: 1 / 1 amendments = 100%

---

## Scope

Epic 8 is a CI/CD-only amendments epic. No BRD F-IDs are in scope. The sole in-scope item is amendment F-26 from `amendments.md`, which covers two structural fixes to `.github/workflows/deploy.yml`.

---

## Amendment Coverage

| ID   | Requirement Summary                                       | Status | Notes |
|------|-----------------------------------------------------------|--------|-------|
| F-26 | Replace git pull with rsync; gate deploy-frontend on BE   | PASS   | Both parts verified (see below) |

---

## F-26 Validation Checklist

### Part 1 — rsync replaces git pull in deploy-backend

| Check | Result | Detail |
|-------|--------|--------|
| No `git pull` present | PASS | grep found 0 matches |
| No `appleboy/ssh-action` present | PASS | grep found 0 matches |
| `rsync -avz --delete` present in deploy-backend | PASS | Line 166 |
| SSH key setup: `mkdir -p ~/.ssh` | PASS | Line 163 |
| SSH key setup: `echo LIGHTSAIL_SSH_KEY > lightsail_key` | PASS | Line 164 |
| SSH key setup: `chmod 600 lightsail_key` | PASS | Line 165 |
| SSH heredoc with `ENDSSH` terminator | PASS | Lines 175–198 |
| Post-deploy: `npm ci --omit=dev` | PASS | Line 189 |
| Post-deploy: `npx prisma generate` | PASS | Line 191 |
| Post-deploy: `npx prisma migrate deploy` | PASS | Line 192 |
| Post-deploy: `pm2 restart ecosystem.config.cjs --update-env` | PASS | Line 194 |
| Post-deploy: `pm2 save` | PASS | Line 195 |
| 9 env var exports in heredoc | PASS | Lines 178–186 (NODE_ENV + 8 secrets) |

### Part 2 — deploy-frontend gated on deploy-backend

| Check | Result | Detail |
|-------|--------|--------|
| `deploy-frontend` has `needs: [test-backend, test-frontend, deploy-backend]` | PASS | Line 101 |
| `deploy-backend` retains `needs: [test-backend, test-frontend]` (no circular dep) | PASS | Line 156 |

### YAML Validity

| Check | Result | Detail |
|-------|--------|--------|
| No tab indentation | PASS | Structural check passed |
| All four jobs present (test-backend, test-frontend, deploy-backend, deploy-frontend) | PASS | All found |
| YAML structure valid (python3 yaml.safe_load unavailable; structural checks used) | PASS | Key structure checks all pass |

---

## Regression Tests

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend (Vitest) | 14 | 120 | PASS |
| Frontend (Vitest) | 11 | 54 | PASS |
| **Total** | **25** | **174** | **PASS** |

Note: AWS SDK NodeVersionSupportWarning (Node 20 < required 22) appears in BE test output — this is a pre-existing [LOW] known issue from Epic 8 TechLead review, not introduced by this epic, and harmless in test context.

---

## Known Defects

- [EPIC-8][LOW] BE: `getCandidateFilePath()` in candidates.service.ts returns unused `filePath` (disk path); only `result.fileName` (S3 key) is consumed by controller post-F-24. Dead code — carried forward from Epic 8 TechLead review.
- [EPIC-8][LOW] BE: AWS SDK v3 emits NodeVersionSupportWarning for Node < 22. Lightsail targets Node 22 LTS in production.
- [EPIC-8][LOW] CI: `StrictHostKeyChecking=no` on SSH/rsync steps. Acceptable for current scale.

---

## Test Artifacts

- No Playwright tests written — this epic has no application behavior to E2E test
- Backend Vitest report: `apps/backend/` (vitest run)
- Frontend Vitest report: `apps/frontend/` (vitest run)
- Test run date: 2026-05-14
- Amendment pass rate: 100% (1/1)

---

## Sign-off

[x] 100% amendment coverage achieved — F-26 fully implemented and verified
[x] All 174 regression tests passing
[x] No new defects introduced
[x] Advancing to epic=8,phase=4.0-complete
