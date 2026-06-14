---
epic: 2
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/routes/candidates.ts, apps/backend/src/controllers/candidates.controller.ts, apps/backend/src/services/candidates.service.ts, apps/backend/src/services/fileParser.service.ts, apps/backend/src/middleware/upload.ts, apps/backend/src/tests/candidates.test.ts, prisma/migrations/20260509191355_epic_2_candidate_management]
---

Date: 2026-05-09
Epic: 2
Phase: 2.0-complete

## Routes Implemented
POST   /candidates                   — createCandidateHandler (multipart/form-data, multer)
GET    /candidates                   — listCandidatesHandler (flattened recruiterChoice per F-14)
GET    /candidates/:id               — getCandidateHandler (full relations: preScreening + postScreening)
PUT    /candidates/:id               — updateCandidateHandler (partial update, Zod validation)
DELETE /candidates/:id               — deleteCandidateHandler (204, Prisma cascade)
GET    /candidates/:id/files/:type   — getCandidateFileHandler (cv | linkedin, res.sendFile)

## Database Models
Candidate: id (UUID PK), name, email?, position?, notes?, cvFileName?, linkedinFileName?, status (CandidateStatus default pending), createdAt, updatedAt — table: candidates
PreScreening: id, candidateId (unique FK→Candidate onDelete:Cascade), profileSummary?, redFlagsJson?, interviewQuestionsJson?, overallFit?, createdAt, updatedAt — table: pre_screenings
PostScreening: id, candidateId (unique FK→Candidate onDelete:Cascade), transcriptFileName?, aiRecommendation?, recruiterChoice?, isOverride?, reasoningJson?, createdAt, updatedAt — table: post_screenings
Enums: CandidateStatus (pending|pre_screened|decided), PostScreeningDecision (pass|no_pass)

## Migrations
20260509191355_epic_2_candidate_management

## Test Results
Integration: 23 passed, 0 failed (2 todo stubs for epics 3–4)

## Env Vars Required
DATABASE_URL, JWT_SECRET, PORT, ANTHROPIC_API_KEY, CORS_ORIGIN, NODE_ENV (all from Epic 1 — no new vars)

## Key Implementation Notes
- multer disk storage: uploads/cv/ and uploads/linkedin/; filename = Date.now()+'-'+originalname; 10 MB limit
- mkdirSync('uploads/cv', { recursive: true }) called in app.ts at startup (before routes)
- uploads/ added to root .gitignore (NF-03b)
- listCandidates flattens postScreening.recruiterChoice to top-level null when PostScreening absent (F-14)
- deleteCandidateHandler checks existence first → 404 before calling prisma.delete
- updateCandidateHandler catches Prisma P2025 → 404; Zod validates partial body
- fileParser.service.ts: parsePdf uses dynamic import for pdf-parse (CJS/ESM compat); returns "" on error
- GET /candidates/:id/files/:type resolves absolute path via path.resolve; checks fs.existsSync before sendFile
- candidatesRouter was already imported/mounted in app.ts from Epic 1 stub — no app.ts route change needed

## Deviations from design.md
None
