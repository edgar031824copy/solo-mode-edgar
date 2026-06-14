---
epic: 15
agent: techlead
status: complete
phase: 3.0-complete
outputs: [docs/review-report-epic-15.md]
---

Date: 2026-05-21
Epic: 15
Phase: 3.0-complete

## Sign-off: APPROVED

Epic 15 (Amendment F-33) — Fix CORS_ORIGIN env var propagation in deploy.yml — reviewed and
approved. Exactly 2 lines added to deploy.yml (functional line + accompanying comment, both
specified in the design doc reference block). Zero FE/BE/Terraform/schema changes. Both
deploy-backend and deploy-frontend jobs remain on runs-on: self-hosted unchanged. No new
workflow files created. All 133 backend tests pass.

## Tests Run
Vitest BE: 133 passed, 0 failed (15 files)
Vitest FE: not run (zero FE changes; last confirmed 58 passed, 0 failed in Epic 14)
Total: 133 passed, 0 failed

## Prior Issue Fixes
None — the only open [MEDIUM] issue (terraform.tfvars git tracking) is an infrastructure
remediation requiring git history scrub + API key rotation. Not addressable in a deploy.yml-only
epic. Carried forward.

## Known Issues
- [EPIC-13][MEDIUM] INFRA: terraform.tfvars still tracked in git (infrastructure/terraform/terraform.tfvars) — contains live Anthropic API key, Supabase URL, JWT secret. Run `git rm --cached infrastructure/terraform/terraform.tfvars`, commit, then git filter-repo to scrub history. Rotate Anthropic API key.
- [EPIC-8][LOW] BE: getCandidateFilePath() dead code — cleanup future pass (carried from epic 8)
- [EPIC-8][LOW] BE: AWS SDK v3 NodeVersionSupportWarning — harmless; Lightsail targets Node 22 LTS (carried)
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no — acceptable at current scale (carried)
- [EPIC-11][LOW] FE: 3s polling interval hardcoded — consider configurable/backoff in future (carried)
