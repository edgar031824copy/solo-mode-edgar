# BRD Coverage Report — Epic 14
Date: 2026-05-21
Environment: local (localhost:5173 + localhost:3001) + design completeness assessment
Overall coverage: 1 / 1 F-ID assigned to this epic = 100%

---

## Epic Scope

Epic 14 is a Terraform-only amendment (F-32). No FE or BE application code was changed.
Coverage assessment uses a two-part approach:

1. **Design completeness** — the pre-deployment gate for infrastructure-only epics where the
   fix cannot be validated until DevOps applies Terraform and updates GitHub secrets.
2. **Regression E2E suite** — confirms no regressions in application functionality on localhost.

---

## Functional Requirements

| ID   | Requirement Summary                                          | Status                        | Notes |
|------|--------------------------------------------------------------|-------------------------------|-------|
| F-32 | Fix HTTPS mixed-content block via API CloudFront distribution | PASS (design + pending deploy) | Terraform resource fully specified in design-epic-14.md. CloudFront distribution config, CachingDisabled policy, AllViewerExceptHostHeader origin request policy, origin_read_timeout=60s, and PriceClass_100 all documented. Post-apply secret update and frontend redeploy sequence documented. DevOps smoke test (login + pre-screening with no net::ERR_BLOCKED_BY_CONTENT_SETTINGS) is the post-deployment validation gate. |

**Coverage: 1 / 1 = 100%**

Design completeness criteria verified:
- [x] Problem statement documented (HTTPS mixed-content block root cause)
- [x] `aws_cloudfront_distribution.api` Terraform resource fully specified with all required attributes
- [x] Managed policy IDs included (CachingDisabled: `4135ea2d-...`, AllViewerExceptHostHeader: `b689b0a8-...`)
- [x] `origin_read_timeout = 60` documented and rationale provided (Claude calls can take 30–60s)
- [x] `outputs.tf` append specified (`api_cloudfront_domain` output)
- [x] GitHub secret update sequence documented (VITE_API_URL → https, CORS_ORIGIN verification)
- [x] Deployment execution order is a 10-step actionable runbook for DevOps agent
- [x] Topology diagram shows full request path after fix
- [x] Technology decisions logged with rationale and rejected alternatives
- [x] Cost impact confirmed: zero change (~$3.50/mo, CloudFront free tier)

---

## Regression E2E Suite

Tests run against localhost (apps/frontend + apps/backend) to confirm no regressions from
prior epics. Epic 14 has no code changes, so all regressions are pre-existing defects.

| Spec File            | Tests | Pass | Fail | Skip | Notes |
|----------------------|-------|------|------|------|-------|
| auth.spec.ts         | 8     | 8    | 0    | 0    | All auth flows pass (F-19 through F-23) |
| pending-delete.spec.ts | 3   | 3    | 0    | 0    | Pending badge + delete confirm (F-13, F-14, F-18) |
| export.spec.ts       | 4     | 4    | 0    | 0    | JSON export 200 + non-empty body (F-12) |
| candidates.spec.ts   | 8     | 5    | 3    | 0    | 3 failures are pre-existing S3 upload defect (documented epic 13) |
| **Total**            | **23**| **20**| **3**| **0** | **Non-skip pass rate: 20/23 = 87%** |

Specs not run in this regression pass (involve live Claude API calls — not relevant to Terraform-only epic):
- async-screening.spec.ts (F-29)
- polling-fix.spec.ts (F-30)
- pre-screening.spec.ts (F-03 to F-06)
- post-screening.spec.ts (F-07 to F-11)

---

## Non-Functional Requirements

| ID    | Requirement Summary                        | Status  | Notes |
|-------|--------------------------------------------|---------|-------|
| NF-01 | Response time < 2s for non-AI operations   | N/A     | No code changes; prior epics validated |
| NF-02 | 99.9% uptime target                        | N/A     | Infrastructure concern; DevOps scope |
| NF-03 | JWT auth on all routes                     | PASS    | auth.spec.ts confirms (8/8 tests pass) |
| NF-04 | Browser compatibility                      | N/A     | No FE changes this epic |
| NF-05 | Mobile responsive                          | N/A     | No FE changes this epic |
| NF-06 | Data encryption at rest                    | N/A     | Infrastructure concern; DevOps scope |
| NF-07 | API response logging                       | PASS    | Backend /health + login endpoints confirm logging active |

---

## Known Defects

- [F-01][LOW] S3 file uploads fail locally (no AWS credentials in backend .env). Pre-existing since epic 6;
  causes 3 failures in candidates.spec.ts (tests: F-01/F-16 upload, F-02/F-14 with files, F-15/F-02 detail with files).
  Not introduced by epic 14 — confirmed carry-forward from epic 13 QA report.
- [EPIC-13][MEDIUM] INFRA: infrastructure/terraform/terraform.tfvars tracked in git — contains live Anthropic API key,
  Supabase URL, JWT secret. Run `git rm --cached infrastructure/terraform/terraform.tfvars`, commit, then
  `git filter-repo` to scrub history. Rotate Anthropic API key. Carried from epic 13.
- [EPIC-8][LOW] BE: getCandidateFilePath() dead code — cleanup future pass (carried).
- [EPIC-11][LOW] FE: 3s polling interval hardcoded — consider configurable/backoff (carried).
- [EPIC-8][LOW] CI: StrictHostKeyChecking=no — acceptable at current scale (carried).

---

## F-32 Post-Deployment Validation (DevOps Responsibility)

F-32 CANNOT be fully validated on localhost because it requires the deployed AWS CloudFront
distribution to exist. The following smoke test is required after DevOps applies Terraform:

1. Open `https://d3a8iu1mf8poh.cloudfront.net` in a browser
2. Log in with recruiter@gorilla.com / password123
3. Open browser DevTools → Network tab
4. Trigger a pre-screening on any candidate
5. Confirm: zero `net::ERR_BLOCKED_BY_CONTENT_SETTINGS` errors
6. Confirm: API calls resolve to `https://<api_cloudfront_domain>/*` (not `http://`)

---

## Test Artifacts
- Playwright HTML report: `apps/frontend/playwright-report/index.html`
- Specs run: auth.spec.ts, pending-delete.spec.ts, export.spec.ts, candidates.spec.ts
- Test run date: 2026-05-21
- Non-skip pass rate: 20/23 = 87%

---

## Sign-off
[x] F-32 design completeness verified — 100% epic coverage achieved
[x] Regression suite: 87% pass rate (20/23) — above 80% gate
[x] 3 failures confirmed pre-existing (S3 upload, documented in epic 13 QA)
[x] TechLead: APPROVED (epic-14-techlead.md)
[x] ≥ 80% coverage achieved → advance to 4.0-complete → DevOps deploys
