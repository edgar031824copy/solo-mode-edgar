---
epic: 11
agent: qa
status: complete
phase: 4.0-complete
outputs: [docs/brd-coverage-epic-11.md, apps/frontend/e2e/async-screening.spec.ts]
---

Epic: 11
Date: 2026-05-15
Phase: 4.0-complete

## Result: PASS — 1/1 = 100% (gate: ≥ 80%)

## Functional Coverage

F-29 (async pre/post-screening): PASS
- 4 Playwright tests written in apps/frontend/e2e/async-screening.spec.ts
- All 4 pass (25.2s total)
- Sub-behaviors covered: POST 202, spinner visible, results after polling,
  post-screen 202, error display via POST 4xx

## Non-Functional Coverage

NF-03 (JWT auth): PASS — all API calls use Authorization header
NF-07 (logging): PASS (carryover from prior epics)

## Known Defects

- [EPIC-11][MEDIUM] preScreeningError-via-polling path is broken:
  CandidateDetailPage.fetchCandidate() calls setLoading(true) on every
  re-fetch (including polling). This remounts the page skeleton, resets
  tab state (defaultValue=pre-screening), and re-initializes PreScreeningTab/
  PostScreeningTab to 'idle' state. Background async job failures stored in
  preScreeningError are never surfaced via polling. Error display works via
  the POST 4xx catch path (tested in Test 4). Fix: do not call setLoading(true)
  on silent polling re-fetches.

## Playwright Report

apps/frontend/playwright-report/index.html
