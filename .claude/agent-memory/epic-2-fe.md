---
epic: 2
agent: fe
status: complete
phase: 2.1-complete
outputs: [apps/frontend/src/lib/types.ts, apps/frontend/src/components/CandidateStatusBadge.tsx, apps/frontend/src/components/FileDropZone.tsx, apps/frontend/src/components/DeleteConfirmDialog.tsx, apps/frontend/src/components/NewCandidateDialog.tsx, apps/frontend/src/components/CandidateDetailsCard.tsx, apps/frontend/src/components/PreScreeningTab.tsx, apps/frontend/src/components/PostScreeningTab.tsx, apps/frontend/src/pages/DashboardPage.tsx, apps/frontend/src/pages/CandidateDetailPage.tsx]
---

Date: 2026-05-09
Epic: 2
Phase: 2.1-complete

## Prior Issue Fixed
[EPIC-1][LOW] LoginPage.tsx now uses shared `api` instance from `src/lib/api.ts` instead of bare axios. LoginPage test updated to mock `../lib/api` instead of `axios`.

## Components Built
CandidateStatusBadge — badge rendering for pending/pre_screened/decided + recruiterChoice pass/no_pass
FileDropZone — reusable HTML5 drag-and-drop + click-to-browse file input with label and filename display
DeleteConfirmDialog — shadcn AlertDialog with controlled open; calls DELETE /candidates/:id then onDeleted()
NewCandidateDialog — shadcn Dialog form: name/email/position/notes + CV + LinkedIn FileDropZone; POST /candidates multipart/form-data
CandidateDetailsCard — shadcn Card showing created/updated dates, CV/LinkedIn file links, notes
PreScreeningTab — Epic 2 stub: empty state with disabled "Run Pre-Screening" button; shows "complete" if preScreening present
PostScreeningTab — Epic 2 stub: empty state with disabled "Run Post-Screening" button
DashboardPage — full candidate list with shadcn Table; New Candidate + Delete actions; fetches GET /candidates on mount
CandidateDetailPage — full detail view: header + CandidateDetailsCard + shadcn Tabs (Pre-Screening / Post-Screening)

## Routes
/ → DashboardPage (protected — replaces Epic 1 stub)
/candidates/:id → CandidateDetailPage (protected — new in Epic 2)
/login → LoginPage (public — unchanged from Epic 1)

## API Endpoints Consumed
GET /candidates
POST /candidates (multipart/form-data)
DELETE /candidates/:id
GET /candidates/:id

## Shadcn Components Added
dialog, alert-dialog, table, dropdown-menu, tabs, textarea, label, separator, skeleton
Fixed `src/lib/utils` → `@/lib/utils` import paths in all new shadcn/ui component files (shadcn CLI wrote wrong paths)

## Test Results
Unit: 35 passed, 0 failed (8 test files)
Excluded Playwright e2e specs from Vitest via `exclude: ['e2e/**']` in vite.config.ts

## Deviations from design-epic-2.md
None — all F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18 requirements implemented as specified.
