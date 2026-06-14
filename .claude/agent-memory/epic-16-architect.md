---
epic: 16
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-16.md]
---

Date: 2026-05-24
Phase: 1.0-complete

## Amendment in Scope
F-34: Fix S3 credential env var name mismatch causing AccessDenied on every file upload.

## Root Cause
deploy.yml writes BACKEND_S3_ACCESS_KEY_ID / BACKEND_S3_SECRET_ACCESS_KEY to .env and
/etc/environment. s3.service.ts initializes S3Client with no explicit credentials block — the
AWS SDK v3 auto-resolves AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, which are never set.
Mismatch means every PutObjectCommand and GetObjectCommand runs without credentials.

## API Endpoints
No new or changed endpoints — fix is internal to the S3 service layer.

## Database Models
No schema changes.

## Anthropic Call Points
None — no AI calls in this epic.

## Infrastructure
No infrastructure changes. deploy.yml unchanged. Existing secrets unchanged.

## Required Env Vars
BACKEND_S3_ACCESS_KEY_ID, BACKEND_S3_SECRET_ACCESS_KEY (already in GitHub secrets and written
to .env by deploy.yml — no new secrets required)

## Exact Change Required
File: apps/backend/src/services/s3.service.ts
Replace:
  const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
With:
  const s3 = new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.BACKEND_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.BACKEND_S3_SECRET_ACCESS_KEY ?? "",
    },
  });

Also: update .env.example (if present) to document BACKEND_S3_ACCESS_KEY_ID and
BACKEND_S3_SECRET_ACCESS_KEY for local dev.

Add one unit test asserting S3Client is constructed with these credential env var names.

## Deviations from BRD
None — F-34 is an amendments.md amendment; not in BRD § 4.4.
