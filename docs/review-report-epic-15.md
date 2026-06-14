# Review Report — Epic 15

**Date:** 2026-05-21
**Phase:** 3.0-complete
**Epic:** 15 (Amendment F-33 — Fix CORS_ORIGIN env var propagation in deploy.yml)

---

## Summary

Issues found: 0
Issues fixed: 0 new issues (prior [MEDIUM] terraform.tfvars carried forward — not a blocker for this epic's scope)
Sign-off: APPROVED

---

## Prior Issue Fixes

The only outstanding [HIGH] or [MEDIUM] issue entering Epic 15 was:

- [EPIC-13][MEDIUM] INFRA: terraform.tfvars still tracked in git — contains live Anthropic API key, Supabase URL, JWT secret.

This issue is an infrastructure/security remediation requiring `git rm --cached`, a history scrub, and API key rotation. It is not addressable within a deploy.yml-only epic. The issue is carried forward unchanged into Known Issues below.

---

## Diff Verification — deploy.yml

**Result: PASS**

`git diff` against `HEAD` shows exactly 2 lines added to `.github/workflows/deploy.yml`:

```
+          # Source /etc/environment so --update-env picks up CORS_ORIGIN and other secrets
+          set -a; source /etc/environment; set +a
```

Both lines are in the "Install production deps, migrate, restart PM2" step, immediately before the `pm2 restart ecosystem.config.cjs --update-env` line — exactly as specified in `docs/design-epic-15.md`.

The comment line is part of the spec's reference block (design doc § "What the final block looks like"). Two lines added is correct.

---

## Constraint Verification

| Constraint | Expected | Actual | Result |
|------------|----------|--------|--------|
| Only file changed | `.github/workflows/deploy.yml` | `.github/workflows/deploy.yml` only (excluding `amendments.md`, `docs/.phase`, and new agent-memory/design files which are framework artifacts) | PASS |
| `deploy-backend` runs-on | `self-hosted` | `self-hosted` (line 25) | PASS |
| `deploy-frontend` runs-on | `self-hosted` | `self-hosted` (line 156) | PASS |
| New workflow files created | None | None — still 5 files: ci.yml, deploy.yml, terraform-destroy.yml, terraform-provision-api-cf.yml, terraform-provision.yml | PASS |
| Terraform files modified | None | `git diff -- infrastructure/` produces no output | PASS |
| Frontend source files modified | None | `git diff -- apps/` produces no output | PASS |
| Backend source files modified | None | `git diff -- apps/` produces no output | PASS |
| Prisma schema modified | None | `git diff -- prisma/` produces no output | PASS |

---

## API Contract Conformance

Not applicable — Epic 15 contains no API changes.

---

## Database Schema Conformance

Not applicable — Epic 15 contains no schema changes.

---

## Backend Unit Tests

```
Test Files  15 passed (15)
Tests       133 passed (133)
```

Run command: `cd apps/backend && DATABASE_URL=postgresql://edgar.hernandez@localhost/recruitment_test npm run test -- --run`

All 133 tests pass. No failures. No regressions from Epic 15 change.

---

## Frontend Tests

Not run — Epic 15 contains zero frontend changes. Frontend tests last confirmed passing in Epic 14 (58 passed, 0 failed).

---

## BRD Functional Coverage

F-33 is defined in `amendments.md` (not in the original BRD). The fix is a CI/CD change verified by the QA agent via live deployment smoke test. Static review confirms the fix is correctly placed in deploy.yml.

All prior BRD functional requirements (F-01 through F-32) remain unmodified.

---

## Known Limitations / Deferred Items

- [EPIC-13][MEDIUM] INFRA: terraform.tfvars still tracked in git — carried forward (see Prior Issue Fixes above)
- [EPIC-8][LOW] BE: getCandidateFilePath() dead code — cleanup future pass
- [EPIC-8][LOW] BE: AWS SDK v3 NodeVersionSupportWarning — harmless (Lightsail targets Node 22 LTS)
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no — acceptable at current scale
- [EPIC-11][LOW] FE: 3s polling interval hardcoded — consider configurable/backoff in future
