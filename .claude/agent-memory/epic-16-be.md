---
epic: 16
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/services/s3.service.ts, apps/backend/src/tests/s3.service.test.ts, apps/backend/.env.example]
---

Date: 2026-05-24
Epic: 16
Phase: 2.0-complete

## Amendment in Scope
F-34: Fix S3 credential env var name mismatch causing AccessDenied on every file upload.

## Routes Implemented
None — internal S3 service fix only. No new or changed endpoints.

## Database Models
No schema changes.

## Migrations
None.

## Change Summary
Modified `apps/backend/src/services/s3.service.ts` line 9: replaced the `S3Client`
initialization that relied on the AWS SDK's default credential chain (which reads
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — never set on Lightsail) with an explicit
`credentials` block reading `BACKEND_S3_ACCESS_KEY_ID` and `BACKEND_S3_SECRET_ACCESS_KEY` —
the names actually written by `deploy.yml` to `/etc/environment` and `.env` on every deploy.

Also:
- Updated `apps/backend/.env.example`: replaced `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  with `BACKEND_S3_ACCESS_KEY_ID`/`BACKEND_S3_SECRET_ACCESS_KEY` and added a comment
  explaining the naming convention.
- Created `apps/backend/src/tests/s3.service.test.ts`: unit test that mocks `S3Client`
  constructor and asserts it is called with the correct credentials shape.

## Test Results
Integration: 134 passed, 0 failed (16 test files)
(133 pre-existing tests + 1 new s3.service unit test)

## Env Vars Required
BACKEND_S3_ACCESS_KEY_ID, BACKEND_S3_SECRET_ACCESS_KEY, AWS_REGION, AWS_UPLOADS_BUCKET

## Deviations from design.md
None.
