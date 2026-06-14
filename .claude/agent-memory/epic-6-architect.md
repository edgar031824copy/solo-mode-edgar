---
epic: 6
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-6.md]
---

Date: 2026-05-11
Phase: 1.0-complete

## API Endpoints
GET /candidates/:id/files/:type — CHANGED: now streams from private S3 uploads bucket instead of local disk (F-24)
All other endpoints: unchanged from epics 1–5

## Database Models
No schema changes. No migration. All models unchanged (Recruiter, Candidate, PreScreening, PostScreening).
cvFileName and linkedinFileName fields now store S3 object keys (cv/<timestamp>-name.pdf) — same String? type, no migration needed.

## Anthropic Call Points
Unchanged from epics 3–4:
POST /candidates/:id/pre-screen → screening.service.ts (pre-screening) — now reads files from S3 via getS3Buffer()
POST /candidates/:id/post-screen → postScreening.service.ts (post-screening) — transcript still read from local disk (not in F-24 scope)

## Infrastructure
Frontend: AWS S3 (private bucket + CloudFront OAC) + CloudFront distribution + ACM cert (us-east-1)
Backend: AWS Lightsail $3.50/mo, Node.js managed by PM2, ecosystem.config.cjs in apps/backend/
Database: Supabase free tier (PostgreSQL) — unchanged
Uploads: AWS S3 private bucket (separate from frontend) — new in Epic 6 (F-24)
IaC: Terraform — infrastructure/terraform/ with 8 files (main, variables, outputs, s3_frontend, s3_uploads, cloudfront, lightsail, acm)
CI/CD: GitHub Actions — .github/workflows/ci.yml (test gate) + deploy.yml (S3 sync + SSH deploy)

## Required Env Vars
Lightsail: NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, CORS_ORIGIN, AWS_UPLOADS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
Build (Vite): VITE_API_URL
GitHub Actions secrets: above + LIGHTSAIL_SSH_KEY, LIGHTSAIL_HOST, FRONTEND_BUCKET, CLOUDFRONT_DISTRIBUTION_ID, SUPABASE_URL

## New Files Required (BE — F-24)
apps/backend/src/services/s3.service.ts — S3 client singleton, uploadToS3(), getS3Stream(), getS3Buffer()
apps/backend/ecosystem.config.cjs — PM2 process definition

## Modified Files (BE — F-24)
apps/backend/src/middleware/upload.ts — cv/linkedin: diskStorage → memoryStorage
apps/backend/src/controllers/candidates.controller.ts — createCandidateHandler: call uploadToS3(); getCandidateFileHandler: pipe getS3Stream() to res
apps/backend/src/services/screening.service.ts — replace local disk reads with getS3Buffer() + parsePdfBuffer()
apps/backend/src/services/fileParser.service.ts — add parsePdfBuffer(buffer: Buffer) export
apps/backend/src/app.ts — remove mkdirSync for uploads/cv and uploads/linkedin (keep uploads/transcript)

## Deviations from BRD
Transcript upload (POST /candidates/:id/post-screen) remains on local disk — F-24 scope covers only CV and LinkedIn files.
CloudFront /api/* behavior forwarding resolves [EPIC-2][LOW] known issue (file link hrefs in production).
