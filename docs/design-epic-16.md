# Design — Epic 16

**Amendment:** F-34
**Scope:** BE-only credential fix for S3Client initialization
**Phase:** 1.0-complete

---

## § F-34 Summary

Every file upload to S3 returns `AccessDenied` at the AWS API layer. The cause is an env var name mismatch between what `deploy.yml` writes and what the AWS SDK reads.

`deploy.yml` writes the S3 IAM credentials under two custom names:

```
BACKEND_S3_ACCESS_KEY_ID
BACKEND_S3_SECRET_ACCESS_KEY
```

These names are written to both `/etc/environment` and `/home/ubuntu/solo-mode/apps/backend/.env` on every deploy (lines 129–130 and 142–143 of `.github/workflows/deploy.yml`).

`apps/backend/src/services/s3.service.ts` currently initializes `S3Client` with no explicit `credentials` block:

```ts
// line 9 — current (broken)
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
```

The AWS SDK v3 credential provider chain falls back to environment variables, but it reads `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` — neither of which is ever set on the Lightsail instance. The custom `BACKEND_S3_*` names are invisible to the SDK's auto-resolution path, so every `PutObjectCommand` and `GetObjectCommand` runs without credentials and AWS returns `AccessDenied`.

---

## § Required Code Change

**File:** `apps/backend/src/services/s3.service.ts`

**Change:** Replace the `S3Client` initialization (line 9) to pass credentials explicitly from the custom env var names.

### Before

```ts
// S3 client reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION from env automatically
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
```

### After

```ts
// S3 client uses BACKEND_S3_ACCESS_KEY_ID / BACKEND_S3_SECRET_ACCESS_KEY — the names
// written by deploy.yml. The AWS SDK's default credential chain reads AWS_ACCESS_KEY_ID
// which is never set on the Lightsail instance, causing AccessDenied on every upload.
const s3 = new S3Client({
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.BACKEND_S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.BACKEND_S3_SECRET_ACCESS_KEY ?? "",
  },
});
```

No other lines in `s3.service.ts` require modification. The `BUCKET` constant, `uploadToS3`, `getS3Stream`, and `getS3Buffer` functions are unchanged.

---

## § Test Coverage Requirements

### Existing tests

Run the full backend test suite after applying the change. All 133 existing tests must continue to pass. The S3 service is tested via integration-level tests that mock the AWS SDK — the credential block is injected at construction time, so tests that stub `S3Client` will not be affected by this change.

### New test to add

Add one unit test in the existing S3 service test file (or create `apps/backend/src/tests/s3.service.test.ts` if none exists) that verifies the credentials are wired correctly:

**Test: "S3Client is initialized with BACKEND_S3_ACCESS_KEY_ID credentials"**

```ts
// Pseudo-code — adapt to the project's existing test style
it("passes BACKEND_S3_ACCESS_KEY_ID and BACKEND_S3_SECRET_ACCESS_KEY to S3Client", async () => {
  // Arrange — set env vars before the module is (re-)loaded
  process.env.BACKEND_S3_ACCESS_KEY_ID = "test-key-id";
  process.env.BACKEND_S3_SECRET_ACCESS_KEY = "test-secret";
  process.env.AWS_REGION = "us-west-2";
  process.env.AWS_UPLOADS_BUCKET = "test-bucket";

  // Act — dynamically import (or reset module cache) so the new env vars are picked up
  const { S3Client } = await import("@aws-sdk/client-s3");
  // Assert — the S3Client constructor was called with the expected credentials shape
  expect(S3Client).toHaveBeenCalledWith(
    expect.objectContaining({
      region: "us-west-2",
      credentials: {
        accessKeyId: "test-key-id",
        secretAccessKey: "test-secret",
      },
    })
  );
});
```

If the test file for `s3.service.ts` already has a test for `S3Client` construction, update it to assert the credentials field. If the existing test infrastructure mocks `S3Client` at the module level, use `vi.mock("@aws-sdk/client-s3")` with a spy on the constructor.

---

## § API Contract

No new or changed endpoints. All existing endpoints remain identical. The fix is internal to the S3 service — callers (`POST /candidates`, `GET /candidates/:id/files/:fileType`) are unaffected.

---

## § Known Risks and Caveats

1. **Empty string fallback** — `process.env.BACKEND_S3_ACCESS_KEY_ID ?? ""` means a misconfigured deploy (missing secret) will produce an empty credentials object rather than failing at startup. The failure mode is unchanged from the current behavior (AccessDenied at upload time), not a crash. This is acceptable — the deploy pipeline already validates secrets via the "Write production environment variables" step.

2. **Local development** — developers running the backend locally who have `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` set in their shell or `~/.aws/credentials` will stop having those auto-resolved. They must add `BACKEND_S3_ACCESS_KEY_ID` and `BACKEND_S3_SECRET_ACCESS_KEY` to their local `.env` file. Update `.env.example` (if it exists in `apps/backend/`) to document both variables.

3. **No deploy.yml changes** — the fix is entirely in `s3.service.ts`. The GitHub Actions workflow and secrets configuration are unchanged. `BACKEND_S3_ACCESS_KEY_ID` / `BACKEND_S3_SECRET_ACCESS_KEY` are already present as GitHub secrets and already written to `.env` on deploy.

4. **No Terraform changes** — the IAM user and its access keys are already provisioned. No infrastructure changes are needed.

5. **getS3Stream and getS3Buffer** — both functions use the same module-level `s3` client instance. Fixing the constructor fixes all three operations (upload, stream download, buffer download) simultaneously.
