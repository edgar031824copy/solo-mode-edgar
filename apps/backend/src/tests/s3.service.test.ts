/**
 * s3.service.test.ts
 * Verifies that S3Client is constructed with BACKEND_S3_ACCESS_KEY_ID and
 * BACKEND_S3_SECRET_ACCESS_KEY — the custom names written by deploy.yml that the
 * AWS SDK's default credential chain cannot auto-resolve.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture constructor calls so we can assert the config object passed in.
const mockS3Client = vi.fn();
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: mockS3Client,
  };
});

describe("s3.service — S3Client credential wiring", () => {
  beforeEach(() => {
    mockS3Client.mockClear();
    // Reset module registry so re-import triggers a fresh S3Client construction
    vi.resetModules();

    process.env.BACKEND_S3_ACCESS_KEY_ID = "test-key-id";
    process.env.BACKEND_S3_SECRET_ACCESS_KEY = "test-secret";
    process.env.AWS_REGION = "us-west-2";
    process.env.AWS_UPLOADS_BUCKET = "test-bucket";
  });

  it("passes BACKEND_S3_ACCESS_KEY_ID and BACKEND_S3_SECRET_ACCESS_KEY to S3Client", async () => {
    // Re-import after resetModules to force module re-execution with current env
    await import("../services/s3.service.js");

    expect(mockS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: "us-west-2",
        credentials: {
          accessKeyId: "test-key-id",
          secretAccessKey: "test-secret",
        },
      })
    );
  });
});
