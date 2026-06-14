# Review Report — Epic 14

**Date:** 2026-05-21
**Phase:** 3.0-complete
**Amendment:** F-32 — HTTPS Mixed-Content Fix (API CloudFront Distribution)
**Scope:** Terraform-only. No FE or BE application code changes.

---

## Summary

Epic 14 is a Terraform-only infrastructure amendment. No application code was modified.
The BE and FE developer agents confirmed zero changes to `apps/frontend/` or `apps/backend/`.
All 191 tests pass — identical to Epic 13 baseline. One prior [MEDIUM] infrastructure issue
from Epic 13 (terraform.tfvars tracked in git) remains partially unresolved and is carried
forward in Known Issues. No [HIGH] or [MEDIUM] code blockers exist. Sign-off: APPROVED.

Issues found: 1 (carried [MEDIUM] from Epic 13)
Issues fixed this epic: 0 (infrastructure/git hygiene — requires git history rewrite, out of
scope for code review)

---

## Prior Issue Fixes

### [EPIC-13][MEDIUM] terraform.tfvars committed with live secrets

**Status: Partially mitigated — not fully resolved.**

The Epic 13 TechLead added `terraform.tfvars` to `.gitignore` (line 50 of root `.gitignore`).
However, `git ls-files infrastructure/terraform/terraform.tfvars` confirms the file is still
tracked in git. Once a file is committed and tracked, `.gitignore` only prevents future
additions — it does not untrack the existing file.

The file contains live credentials: Anthropic API key (`sk-ant-api03-...`), Supabase database
URL, and JWT secret. These values remain in the git history and the working tree.

Recommended remediation (deferred — not a code blocker for this Terraform-only epic):
1. `git rm --cached infrastructure/terraform/terraform.tfvars` and commit the removal.
2. Run `git filter-repo --path infrastructure/terraform/terraform.tfvars --invert-paths`
   to scrub history, then force-push (coordinate with team).
3. Rotate the Anthropic API key immediately.

---

## API Contract Conformance

No API changes in Epic 14. All endpoints from prior epics remain intact and unchanged.

| Category | Status |
|----------|--------|
| Auth endpoints (`POST /auth/login`, `GET /auth/me`) | PASS (unchanged) |
| Candidates CRUD | PASS (unchanged) |
| Pre-screening (`POST /candidates/:id/pre-screen`) | PASS (unchanged) |
| Post-screening (`POST /candidates/:id/post-screen`) | PASS (unchanged) |
| Report (`GET /candidates/:id/report`) | PASS (unchanged) |
| Health (`GET /health`) | PASS (unchanged) |

---

## Database Schema Conformance

Schema is unchanged from Epic 11/12/13. No migrations for Epic 14.
`prisma/schema.prisma` remains consistent with prior design docs.

---

## Terraform Conformance (Design vs. Actual)

Epic 14's design doc (`docs/design-epic-14.md`) specifies:
- New file: `infrastructure/terraform/cloudfront_api.tf` — `aws_cloudfront_distribution.api` resource
- Append to `infrastructure/terraform/outputs.tf` — `api_cloudfront_domain` output

**Actual state:** Neither file has been written yet. This is expected and correct — the TechLead
runs before the DevOps agent. The DevOps agent is responsible for writing `cloudfront_api.tf`,
appending the output, committing, and running `terraform-provision.yml` via GitHub Actions.

The design spec is well-formed. The DevOps agent has a complete, actionable spec to execute.

---

## Security Review

| Check | Result |
|-------|--------|
| No API keys in source code | PASS |
| No hardcoded secrets in `apps/` | PASS |
| JWT middleware present and configured | PASS |
| CORS configured (not open wildcard) | PASS |
| terraform.tfvars in .gitignore | PASS (entry present) |
| terraform.tfvars untracked from git | FAIL — file still tracked; see Prior Issue Fixes above |
| No new secrets introduced in Epic 14 | PASS — Terraform-only, no new code |

---

## Test Results

### Backend (Vitest)

```
Test Files  15 passed (15)
      Tests  133 passed (133)
```

Command: `DATABASE_URL=postgresql://edgar.hernandez@localhost/recruitment_test npm run test -- --run`

### Frontend (Vitest)

```
Test Files  11 passed (11)
      Tests  58 passed (58)
```

Command: `npm run test -- --run`

### Total

| Suite | Files | Tests | Pass | Fail |
|-------|-------|-------|------|------|
| Backend | 15 | 133 | 133 | 0 |
| Frontend | 11 | 58 | 58 | 0 |
| **Total** | **26** | **191** | **191** | **0** |

---

## BRD Functional Coverage

F-32 is defined in `amendments.md`, not in `brd.md § 5.3`. All original F-01..F-23 requirements
were covered in prior epics. No regression has occurred; the full test suite passes.

| Requirement | Description | Status |
|-------------|-------------|--------|
| F-32 (amendments) | HTTPS mixed-content fix via API CloudFront distribution | PARTIAL — design complete, DevOps execution pending |
| F-01 to F-23 | All BRD functional requirements | PASS (no regression — 191/191 tests pass) |

F-32 is marked PARTIAL because the Terraform resource has not yet been applied — that is
the DevOps agent's job. From the TechLead's perspective, the design spec is correct and
complete, the application code is sound, and all tests pass.

---

## Known Limitations and Deferred Items

1. **terraform.tfvars tracked in git** — live credentials in git history. Partial mitigation
   only (`.gitignore` entry added in Epic 13). Full fix requires `git rm --cached` + history
   scrub + key rotation. Non-blocking for Terraform-only epic.

2. **F-32 Terraform execution** — pending DevOps agent. After `terraform-provision.yml`
   completes, `VITE_API_URL` and `CORS_ORIGIN` GitHub secrets must be updated and a frontend
   redeploy triggered.

3. **[LOW] BE dead code** — `getCandidateFilePath()` in `fileParser.service.ts` carried from Epic 8.

4. **[LOW] FE polling interval hardcoded** — 3s poll in `CandidateDetailPage.tsx` carried from Epic 11.

5. **[LOW] CI StrictHostKeyChecking=no** — acceptable at current scale, carried from prior epics.
