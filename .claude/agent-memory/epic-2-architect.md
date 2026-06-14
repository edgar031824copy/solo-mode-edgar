---
epic: 2
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-2.md]
---

Date: 2026-05-09
Phase: 1.0-complete

## API Endpoints
POST   /candidates               — create candidate (multipart/form-data; cv + linkedin files optional)
GET    /candidates               — list all candidates; response includes recruiterChoice field
GET    /candidates/:id           — full candidate detail with preScreening + postScreening relations
PUT    /candidates/:id           — partial update (name, email, position, notes); JSON body
DELETE /candidates/:id           — cascade delete candidate + all child records; 204 no body
GET    /candidates/:id/files/:type — serve uploaded file (cv|linkedin) as binary stream

## Database Models
Candidate: id (UUID PK), name, email?, position?, notes?, cvFileName?, linkedinFileName?, status (enum: pending|pre_screened|decided), createdAt, updatedAt — table: candidates
PreScreening: id, candidateId (FK→Candidate onDelete:Cascade), profileSummary?, redFlagsJson?, interviewQuestionsJson?, overallFit?, createdAt, updatedAt — table: pre_screenings
PostScreening: id, candidateId (FK→Candidate onDelete:Cascade), transcriptFileName?, aiRecommendation?, recruiterChoice?, isOverride?, reasoningJson?, createdAt, updatedAt — table: post_screenings
Enums: CandidateStatus (pending|pre_screened|decided), PostScreeningDecision (pass|no_pass)

## Anthropic Call Points
None — Epic 2 is Candidate Management only. First Anthropic call is Epic 3 (POST /candidates/:id/pre-screen).

## Infrastructure
Frontend: AWS S3 + CloudFront (unchanged from Epic 1)
Backend: AWS Lightsail + PM2 (unchanged); uploads/ directory created at startup
Database: Supabase free tier (unchanged); new migration adds Candidate + PreScreening + PostScreening
IaC: Terraform (unchanged)

## Required Env Vars
DATABASE_URL, JWT_SECRET, PORT, ANTHROPIC_API_KEY, CORS_ORIGIN, NODE_ENV (all from Epic 1 — no new vars)

## Key Design Decisions
- PreScreening and PostScreening models defined in Epic 2 schema so Epics 3+4 add only controller logic, not schema migrations
- onDelete:Cascade on both child models — DELETE /candidates/:id is a single Prisma call
- GET /candidates flattens postScreening.recruiterChoice into top-level response for F-14 badge rendering
- File storage: multer disk storage under uploads/cv/ and uploads/linkedin/; filename = Date.now()+'-'+originalname
- uploads/ dir added to .gitignore — no PII committed (NF-03b)
- CandidateDetailPage uses shadcn Tabs (Pre-Screening / Post-Screening) — no side-by-side columns (F-15)
- PreScreeningTab and PostScreeningTab are stubs in Epic 2; Epics 3+4 fill in actual content
- DashboardPage local React state only — no global store needed in Epic 2
- fileParser.service.ts uses pdf-parse; returns empty string on error (non-fatal in Epic 2)
- FE adds /candidates/:id route inside existing ProtectedRoute wrapper — no auth changes

## Deviations from BRD
None
