# Review Report — Epic 13 (F-31: AWS Account Migration + OIDC)

**Date:** 2026-05-19
**Phase:** 3.0-running → 3.0-complete
**TechLead:** TechLead Agent

---

## Summary

Epic 13 is a pure infrastructure migration (F-31). No frontend or backend application code was changed. Both BE and FE agent-memory files confirm empty change sets. The review focused on:

1. Resolving prior [HIGH]/[MEDIUM] known issues — **None found** (all prior issues are [LOW])
2. Running the full test suite against existing code — **All 191 tests pass**
3. Static security review of committed infrastructure files — **One pre-existing issue found and partially mitigated**

Issues found: 1 (pre-existing terraform.tfvars with secrets in git history)
Issues fixed: `.gitignore` updated to prevent future commits of `terraform.tfvars`

---

## Prior Issue Fixes

No [HIGH] or [MEDIUM] issues carried forward from any prior epic (epics 1–12). All outstanding known issues entering epic 13 were [LOW] severity:

- [EPIC-8][LOW] BE: getCandidateFilePath() dead code — deferred cleanup
- [EPIC-8][LOW] BE: AWS SDK v3 NodeVersionSupportWarning — harmless
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no — acceptable at current scale
- [EPIC-11][LOW] FE: 3s polling interval hardcoded — future improvement

No code changes required before running tests.

---

## Static Review

### Infrastructure Files (terraform/)

**`infrastructure/terraform/main.tf`** — Does NOT yet contain the `backend "s3"` block from design-epic-13.md. This is correct: those changes are DevOps agent deliverables, not BE/FE agent deliverables. TechLead confirms the spec is defined; DevOps will apply it.

**`infrastructure/terraform/variables.tf`** — Does NOT yet contain `runner_registration_token`. Correct: DevOps deliverable.

**`infrastructure/terraform/lightsail.tf`** — Does NOT yet contain the runner setup block. Correct: DevOps deliverable.

**`infrastructure/terraform/terraform.tfvars`** — SECURITY FINDING: this file is tracked in git (committed in epic 6) and contains live credentials:
- `database_url` (Supabase connection string with password)
- `jwt_secret`
- `anthropic_api_key` (live `sk-ant-api03-...` key)

Mitigation applied: added `terraform.tfvars` to `.gitignore` so future commits cannot re-commit this file. The historical commit (2ec7f31) still contains the secrets — the API key should be rotated by the user.

**`infrastructure/terraform/terraform.tfstate`** and **`terraform.tfstate.backup`** — Not tracked in git (correctly excluded via `*.tfstate*` in `.gitignore`). Confirmed clean.

### CI/CD Workflows

**`.github/workflows/deploy.yml`** — Current version uses static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in all three frontend AWS steps. The design-epic-13.md OIDC migration has not been applied yet — correct, this is a DevOps deliverable. No secrets are hardcoded; values are read from GitHub Secrets.

**`terraform-provision.yml` and `terraform-destroy.yml`** — Not yet created. DevOps deliverables.

### Application Code Security

- No hardcoded API keys or credentials found in `apps/backend/src/` or `apps/frontend/src/`
- Test fixtures contain `password123` for the seeded recruiter account — acceptable for test context, not production code
- No `any` TypeScript types introduced this epic (no application code changes)
- Zod validation present on all BE request bodies (unchanged from epic 12)

---

## Test Results

### Backend — Vitest

```
Test Files: 15 passed (15)
Tests:      133 passed (133)
Duration:   ~40s
```

No failures. The `ERROR` level log lines during the run are from intentional test scenarios (background screening failures, 404 for nonexistent candidate) — these are expected and asserted by the tests.

### Frontend — Vitest

```
Test Files: 11 passed (11)
Tests:      58 passed (58)
```

No failures.

**Total: 191 passed, 0 failed**

---

## API Contract Conformance

No API changes in epic 13. All endpoints from prior epics remain intact and tested:

| Endpoint | Status |
|----------|--------|
| POST /auth/login | PASS |
| GET /candidates | PASS |
| POST /candidates | PASS |
| GET /candidates/:id | PASS |
| GET /candidates/:id/report | PASS |
| POST /candidates/:id/pre-screen | PASS |
| POST /candidates/:id/post-screen | PASS |
| PATCH /candidates/:id/decision | PASS |
| GET /health | PASS |

---

## Database Schema Conformance

No schema changes in epic 13. `prisma/schema.prisma` is unchanged from epic 11/12. All migrations deployed successfully to `recruitment_test` database (0 new migrations applied — correct).

---

## BRD Functional Coverage

Epic 13 implements F-31 from `amendments.md` only — no BRD rows map to this epic. All prior F-IDs (F-01 through F-30) remain implemented and passing in the test suite.

| Amendment | Description | Coverage |
|-----------|-------------|----------|
| F-31 | AWS account migration + OIDC | DevOps deliverable — pending DevOps agent execution |

---

## Known Limitations

1. **terraform.tfvars secrets in git history** — The Anthropic API key committed in epic 6 is in git history. The key should be rotated. The `.gitignore` fix prevents the file from being committed again but does not rewrite history.

2. **DevOps deliverables pending** — The following infrastructure changes are designed but not yet implemented (DevOps agent runs next):
   - `infrastructure/terraform/main.tf`: S3 remote backend block
   - `infrastructure/terraform/variables.tf`: `runner_registration_token` variable
   - `infrastructure/terraform/lightsail.tf`: runner setup block in user_data
   - `.github/workflows/terraform-provision.yml`: new file
   - `.github/workflows/terraform-destroy.yml`: new file
   - `.github/workflows/deploy.yml`: OIDC credentials for deploy-frontend job
