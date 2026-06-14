/**
 * asyncScreening.test.ts
 * F-29: Tests for async (202) pre-screen and post-screen endpoints.
 *
 * Pattern for background job tests: since fire-and-forget is not directly awaitable
 * via HTTP, we export runPreScreeningAsync and runPostScreeningAsync from the
 * controller as named exports and call them directly to assert DB side-effects.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { makeAuthToken } from "./helpers/auth.js";

// ── S3 mock — required because createCandidate calls uploadToS3 ──────────────
vi.mock("../services/s3.service.js", () => ({
  uploadToS3: vi.fn().mockImplementation(async (folder: string, file: { originalname: string }) => {
    return `${folder}/${Date.now()}-${file.originalname}`;
  }),
  getS3Stream: vi.fn().mockResolvedValue(null),
  getS3Buffer: vi.fn().mockResolvedValue(
    Buffer.from("John Doe - Software Engineer\nExperience: 5 years TypeScript")
  ),
}));

// ── screening.service mock — controls runPreScreening behaviour per test ─────
const mockRunPreScreening = vi.fn();
vi.mock("../services/screening.service.js", () => ({
  runPreScreening: (...args: unknown[]) => mockRunPreScreening(...args),
}));

// ── postScreening.service mock — controls runPostScreening behaviour ─────────
const mockRunPostScreening = vi.fn();
vi.mock("../services/postScreening.service.js", () => ({
  runPostScreening: (...args: unknown[]) => mockRunPostScreening(...args),
  recordDecision: vi.fn(),
}));

const app = createApp();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createCandidateWithCv(token: string): Promise<string> {
  const buf = Buffer.from("John Doe - Software Engineer");
  const res = await request(app)
    .post("/candidates")
    .set("Authorization", `Bearer ${token}`)
    .field("name", "Async Test Candidate")
    .attach("cv", buf, { filename: "cv.txt", contentType: "text/plain" });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createCandidateWithoutFiles(token: string): Promise<string> {
  const res = await request(app)
    .post("/candidates")
    .set("Authorization", `Bearer ${token}`)
    .field("name", "No Files Candidate");
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterEach(async () => {
  await prisma.candidate.deleteMany();
  vi.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /candidates/:id/pre-screen — async tests ─────────────────────────────

describe("POST /candidates/:id/pre-screen (async)", () => {
  it("returns 202 and message when candidate has CV", async () => {
    const token = makeAuthToken();
    // Default mock: resolves without doing anything (simulates successful background call)
    mockRunPreScreening.mockResolvedValue(undefined);

    const candidateId = await createCandidateWithCv(token);

    const res = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body.message).toBe("Pre-screening started");
  });

  it("returns 404 for non-existent candidate", async () => {
    const token = makeAuthToken();

    const res = await request(app)
      .post("/candidates/00000000-0000-0000-0000-000000000000/pre-screen")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });

  it("returns 400 when candidate has no files", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithoutFiles(token);

    const res = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No CV file found for this candidate");
  });

  it("clears preScreeningError before responding 202", async () => {
    const token = makeAuthToken();
    mockRunPreScreening.mockResolvedValue(undefined);

    const candidateId = await createCandidateWithCv(token);

    // Seed a prior error directly in DB
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { preScreeningError: "Previous error message" },
    });

    const res = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(202);

    // preScreeningError should be cleared to null synchronously before 202
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate?.preScreeningError).toBeNull();
  });

  it("background success: runPreScreeningAsync resolves — preScreeningError remains null", async () => {
    const token = makeAuthToken();
    mockRunPreScreening.mockResolvedValue(undefined);

    const candidateId = await createCandidateWithCv(token);

    // Import the exported async helper to call it directly and await it
    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");

    // Clear preScreeningError before running (mirrors what the handler does)
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { preScreeningError: null },
    });

    await runPreScreeningAsync(candidateId);

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate?.preScreeningError).toBeNull();
  });

  it("background failure: runPreScreeningAsync rejects — preScreeningError is set to error message", async () => {
    const token = makeAuthToken();
    const errorMsg = "Claude API timeout";
    mockRunPreScreening.mockRejectedValue(new Error(errorMsg));

    const candidateId = await createCandidateWithCv(token);

    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");

    await runPreScreeningAsync(candidateId);

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate?.preScreeningError).toBe(errorMsg);
  });
});

// ── POST /candidates/:id/post-screen — async tests ────────────────────────────

describe("POST /candidates/:id/post-screen (async)", () => {
  it("returns 202 and message when transcript is provided", async () => {
    const token = makeAuthToken();
    mockRunPostScreening.mockResolvedValue(undefined);

    const candidateId = await createCandidateWithCv(token);
    const transcriptBuf = Buffer.from("Interviewer: Tell me about yourself...");

    const res = await request(app)
      .post(`/candidates/${candidateId}/post-screen`)
      .set("Authorization", `Bearer ${token}`)
      .attach("transcript", transcriptBuf, { filename: "transcript.txt", contentType: "text/plain" });

    expect(res.status).toBe(202);
    expect(res.body.message).toBe("Post-screening started");
  });

  it("returns 400 when transcript file is missing", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    const res = await request(app)
      .post(`/candidates/${candidateId}/post-screen`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Transcript file is required");
  });

  it("returns 404 for non-existent candidate", async () => {
    const token = makeAuthToken();
    const transcriptBuf = Buffer.from("transcript content");

    const res = await request(app)
      .post("/candidates/00000000-0000-0000-0000-000000000000/post-screen")
      .set("Authorization", `Bearer ${token}`)
      .attach("transcript", transcriptBuf, { filename: "transcript.txt", contentType: "text/plain" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });

  it("background failure: runPostScreeningAsync rejects — preScreeningError is set", async () => {
    const token = makeAuthToken();
    const errorMsg = "Post-screening Claude timeout";
    mockRunPostScreening.mockRejectedValue(new Error(errorMsg));

    const candidateId = await createCandidateWithCv(token);

    const { runPostScreeningAsync } = await import("../controllers/candidates.controller.js");

    // Supply a fake multer file object for the direct call
    const fakeFile = {
      fieldname: "transcript",
      originalname: "transcript.txt",
      encoding: "7bit",
      mimetype: "text/plain",
      buffer: Buffer.from("interview content"),
      size: 17,
    } as Express.Multer.File;

    await runPostScreeningAsync(candidateId, fakeFile);

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate?.preScreeningError).toBe(errorMsg);
  });
});

// ── GET /candidates/:id — preScreeningError field ─────────────────────────────

describe("GET /candidates/:id includes preScreeningError", () => {
  it("preScreeningError is null when no error has occurred", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    const res = await request(app)
      .get(`/candidates/${candidateId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(res.body, "preScreeningError")).toBe(true);
    expect(res.body.preScreeningError).toBeNull();
  });

  it("preScreeningError contains error string when a background job failed", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    // Seed an error directly
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { preScreeningError: "Anthropic API returned 503" },
    });

    const res = await request(app)
      .get(`/candidates/${candidateId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.preScreeningError).toBe("Anthropic API returned 503");
  });
});
