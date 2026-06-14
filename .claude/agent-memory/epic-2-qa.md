---
epic: 2
agent: qa
status: complete
phase: 4.0-complete
outputs: [docs/brd-coverage-epic-2.md, apps/frontend/e2e/candidates.spec.ts, apps/frontend/e2e/fixtures/sample-cv.pdf, apps/frontend/e2e/fixtures/sample-linkedin.txt]
---

Epic: 2
Date: 2026-05-09
Phase: 4.0-complete

## Result: PASS — 100%

## Functional Coverage
F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18: 8/8 = 100%

## Non-Functional Coverage
NF-03b: PASS (GET /candidates response verified — no unexpected fields)
NF-01, NF-02, NF-04, NF-05, NF-06, NF-07: not in Epic 2 scope

## Known Defects
- [EPIC-1][MEDIUM] FE: `api.ts` 401 interceptor redirects to /login on ANY 401 response, including POST /auth/login with wrong credentials. Error alert never renders. Breaks F-20 "invalid credentials" auth tests. Fix: exclude /auth/login path from 401 redirect in api interceptor.

## Playwright Report
playwright-report/index.html

## Test Files Written
- apps/frontend/e2e/candidates.spec.ts — 8 tests covering all Epic 2 F-IDs + NF-03b
- apps/frontend/e2e/fixtures/sample-cv.pdf — minimal PDF for upload tests
- apps/frontend/e2e/fixtures/sample-linkedin.txt — LinkedIn export text fixture

## Notes
- Epic 1 auth.spec.ts: 7/9 pass (2 pre-existing F-20 failures — application bug, not test bug)
- Epic 2 candidates.spec.ts: 8/8 pass
- Dialog close detection: @base-ui/react keeps dialog in DOM; tests wait for candidate link to appear instead of checking dialog attributes
- cvFileName stored with timestamp prefix; list truncates at 24 chars; test checks for 'sample-cv' fragment
