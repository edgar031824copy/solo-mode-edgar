---
epic: 6
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/services/s3.service.ts, apps/backend/src/middleware/upload.ts, apps/backend/src/services/fileParser.service.ts, apps/backend/src/controllers/candidates.controller.ts, apps/backend/src/services/screening.service.ts, apps/backend/src/app.ts, apps/backend/ecosystem.config.cjs]
---

Date: 2026-05-11
Epic: 6
Phase: 2.0-complete

## Changes Made

### New file: apps/backend/src/services/s3.service.ts
S3 client singleton using @aws-sdk/client-s3 v3. Exports:
- uploadToS3(folder, file): uploads memoryStorage buffer to S3, returns object key "cv/ts-name.pdf"
- getS3Stream(key): streams S3 object to Node Readable (used by getCandidateFileHandler)
- getS3Buffer(key): downloads S3 object as Buffer (used by screening.service.ts)

### Modified: apps/backend/src/middleware/upload.ts
cv/linkedin fields: switched from diskStorage to memoryStorage. transcriptStorage (disk) unchanged.

### Modified: apps/backend/src/services/fileParser.service.ts
Added parsePdfBuffer(buffer: Buffer): Promise<string> — same pdfParse/lib/pdf-parse.js, buffer input.
parsePdf(filePath) kept for backward compat (postScreening transcript reads from disk).

### Modified: apps/backend/src/controllers/candidates.controller.ts
createCandidateHandler: calls uploadToS3("cv", cvFile) / uploadToS3("linkedin", linkedinFile);
stores returned S3 key instead of file.filename.
getCandidateFileHandler: pipes getS3Stream(s3Key) to response; 502 on S3 error, 404 if no key.

### Modified: apps/backend/src/services/screening.service.ts
Replaced path.resolve("uploads/cv", ...) + parsePdf() with getS3Buffer(key) + parsePdfBuffer().
Same for linkedin. Transcript reads (postScreening.service.ts) untouched.

### Modified: apps/backend/src/app.ts
Removed mkdirSync("uploads/cv") and mkdirSync("uploads/linkedin"). mkdirSync("uploads/transcript") kept.

### New file: apps/backend/ecosystem.config.cjs
PM2 process definition for Lightsail deployment.

## Tests Status

Integration: 60 passed, 0 failed (7 test files)
S3 mocked in candidates.test.ts, screening.test.ts, postScreening.test.ts via vi.mock("../services/s3.service.js").
fileParser.test.ts: added 2 parsePdfBuffer tests (valid PDF buffer → non-empty text, invalid → "").

## Known Issues

None. All 60 tests pass. AWS SDK emits a Node 20 deprecation warning (harmless — applies to SDK
versions published after Jan 2027).
