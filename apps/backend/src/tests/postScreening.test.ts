/**
 * postScreening.test.ts
 * Tests for POST /candidates/:id/post-screen and POST /candidates/:id/decision.
 * F-29: post-screen endpoint returns 202 immediately. Background job tested via
 * exported runPostScreeningAsync helper (NOT by calling HTTP + background job again).
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { makeAuthToken } from "./helpers/auth.js";
import fs from "fs";
import path from "path";

// ── Anthropic mock ────────────────────────────────────────────────────────────
const VALID_PRE_RESPONSE = JSON.stringify({
  profileSummary:
    "Experienced software engineer with 5 years of TypeScript experience. Strong fit for the Senior Engineer role based on demonstrated full-stack skills.",
  redFlags: [
    {
      claim: "Led a team of 10 engineers",
      source: "cv",
      severity: "medium",
      validationQuestion:
        "Can you describe the specific scope of that leadership role?",
    },
  ],
  interviewQuestions: [
    {
      question: "Walk me through your most complex TypeScript project.",
      rationale: "CV claims deep TypeScript expertise — needs probing.",
      type: "verification",
    },
    {
      question: "Describe your experience with distributed systems.",
      rationale: "CV mentions microservices but lacks specifics.",
      type: "verification",
    },
    {
      question: "How have you handled system design at scale?",
      rationale: "Senior role requires design experience not evidenced in profile.",
      type: "verification",
    },
    {
      question: "How do you approach cross-functional collaboration?",
      rationale: "Senior engineer role requires leadership skills.",
      type: "role-fit",
    },
    {
      question: "How do you stay current with rapidly evolving technology?",
      rationale: "General role-fit probe for senior IC.",
      type: "role-fit",
    },
  ],
  overallFit: 4,
});

const VALID_POST_RESPONSE = JSON.stringify({
  recommendation: "pass",
  reasoning:
    "The candidate clearly demonstrated TypeScript expertise by walking through their distributed system project in detail. They addressed the pre-screening red flag about team leadership with a concrete example. Overall, the candidate shows strong competency for a Senior Engineer role.",
  keyFindings: [
    {
      type: "strength",
      description:
        "Candidate provided detailed account of leading a team of 10 engineers, resolving the pre-screening red flag.",
      relatedQuestion: "Walk me through your most complex TypeScript project.",
    },
    {
      type: "strength",
      description:
        "Strong understanding of distributed systems evidenced by technical depth in answers.",
      relatedQuestion: null,
    },
    {
      type: "concern",
      description:
        "Answers on cross-functional collaboration were somewhat vague — lacked concrete examples.",
      relatedQuestion: "How do you approach cross-functional collaboration?",
    },
  ],
  confidenceScore: 4,
});

const mockMessagesCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  function MockAnthropic() {
    return {
      messages: {
        create: mockMessagesCreate,
      },
    };
  }
  return { default: MockAnthropic };
});

vi.mock("../services/s3.service.js", () => ({
  uploadToS3: vi.fn().mockImplementation(async (folder: string, file: { originalname: string }) => {
    return `${folder}/${Date.now()}-${file.originalname}`;
  }),
  getS3Stream: vi.fn().mockResolvedValue(null),
  getS3Buffer: vi.fn().mockResolvedValue(
    Buffer.from("John Doe - Software Engineer\nExperience: 5 years TypeScript")
  ),
}));

// ── App ───────────────────────────────────────────────────────────────────────

const app = createApp();

const preScreenResult = { content: [{ type: "text", text: VALID_PRE_RESPONSE }] };
const postScreenResult = { content: [{ type: "text", text: VALID_POST_RESPONSE }] };

/** Creates a candidate with a CV file attached. Returns candidateId. */
async function createCandidateWithCv(token: string): Promise<string> {
  const buf = Buffer.from("John Doe - Software Engineer\nExperience: 5 years TypeScript");
  const res = await request(app)
    .post("/candidates")
    .set("Authorization", `Bearer ${token}`)
    .field("name", "Post Test Candidate")
    .field("position", "Senior Engineer")
    .attach("cv", buf, { filename: "test-cv.txt", contentType: "text/plain" });
  return res.body.id as string;
}

/**
 * Creates a real transcript file on disk at the path postScreening.service.ts expects.
 * Returns a multer file object with the real `filename` set (disk storage format).
 */
function makeTempTranscriptFile(): Express.Multer.File {
  const transcriptDir = path.resolve("uploads/transcript");
  fs.mkdirSync(transcriptDir, { recursive: true });
  const filename = `${Date.now()}-transcript.txt`;
  const filePath = path.join(transcriptDir, filename);
  const content =
    "Interviewer: Tell me about your TypeScript experience.\nCandidate: I have 5 years of TypeScript experience...";
  fs.writeFileSync(filePath, content, "utf-8");
  return {
    fieldname: "transcript",
    originalname: "transcript.txt",
    encoding: "7bit",
    mimetype: "text/plain",
    filename,
    path: filePath,
    size: Buffer.byteLength(content),
    buffer: Buffer.alloc(0),
    stream: null as never,
    destination: transcriptDir,
  } as Express.Multer.File;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockMessagesCreate.mockReset();
  mockMessagesCreate.mockResolvedValue(preScreenResult);
});

afterEach(async () => {
  await prisma.postScreening.deleteMany();
  await prisma.preScreening.deleteMany();
  await prisma.candidate.deleteMany();
  // Clean up any temp transcript files written during tests
  const transcriptDir = path.resolve("uploads/transcript");
  if (fs.existsSync(transcriptDir)) {
    for (const file of fs.readdirSync(transcriptDir)) {
      try { fs.unlinkSync(path.join(transcriptDir, file)); } catch { /* ignore */ }
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /candidates/:id/post-screen — 404 ────────────────────────────────────

describe("POST /candidates/:id/post-screen — 404", () => {
  it("returns 404 when candidate does not exist", async () => {
    const token = makeAuthToken();
    const buf = Buffer.from("transcript text");

    const res = await request(app)
      .post("/candidates/00000000-0000-0000-0000-000000000000/post-screen")
      .set("Authorization", `Bearer ${token}`)
      .attach("transcript", buf, { filename: "t.txt", contentType: "text/plain" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

// ── POST /candidates/:id/post-screen — 400 ────────────────────────────────────

describe("POST /candidates/:id/post-screen — 400", () => {
  it("returns 400 when no transcript file is uploaded", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    const res = await request(app)
      .post(`/candidates/${candidateId}/post-screen`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Transcript file is required");
  });
});

// ── POST /candidates/:id/post-screen — 409 guard in background job ────────────
// F-29: The 409 guard fires inside runPostScreening (background). HTTP returns 202.
// The error is written to Candidate.preScreeningError by runPostScreeningAsync.

describe("POST /candidates/:id/post-screen — 409 guard (background)", () => {
  it("background job sets preScreeningError when candidate has no preScreening record", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);
    // Skip pre-screen — go straight to post-screen background job

    const { runPostScreeningAsync } = await import("../controllers/candidates.controller.js");
    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    // Error should be written to preScreeningError
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate!.preScreeningError).not.toBeNull();
    expect(candidate!.preScreeningError).toMatch(/Pre-screening must be completed/i);
  });
});

// ── POST /candidates/:id/post-screen — 202 + background success ───────────────

describe("POST /candidates/:id/post-screen — 202", () => {
  it("returns 202 when transcript is provided and candidate exists", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    const buf = Buffer.from("Interviewer: Tell me about yourself.\nCandidate: Sure...");
    const res = await request(app)
      .post(`/candidates/${candidateId}/post-screen`)
      .set("Authorization", `Bearer ${token}`)
      .attach("transcript", buf, { filename: "transcript.txt", contentType: "text/plain" });

    expect(res.status).toBe(202);
    expect(res.body.message).toBe("Post-screening started");
  });

  it("PostScreening record created after background job completes", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    // Set up mock sequence: pre-screen then post-screen
    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    // Run pre-screen background job directly
    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );
    await runPreScreeningAsync(candidateId);

    // Run post-screen background job directly (no HTTP — avoids double-fire-and-forget)
    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    const record = await prisma.postScreening.findUnique({ where: { candidateId } });
    expect(record).not.toBeNull();
    expect(record!.aiRecommendation).toBe("pass");
    expect(record!.recruiterChoice).toBeNull();
    expect(record!.isOverride).toBeNull();
    expect(record!.reasoningJson).toBeTruthy();
  });

  it("candidate status advances to decided after background job completes", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );
    await runPreScreeningAsync(candidateId);

    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    const candidateRes = await request(app)
      .get(`/candidates/${candidateId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(candidateRes.body.status).toBe("decided");
  });
});

// ── POST /candidates/:id/post-screen — upsert / re-run ───────────────────────

describe("POST /candidates/:id/post-screen — upsert on re-run", () => {
  it("re-run clears recruiterChoice + isOverride and overwrites aiRecommendation", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    // 3 Claude calls: pre-screen + first post-screen + second post-screen
    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );

    await runPreScreeningAsync(candidateId);

    // First post-screen run
    const fakeFile1 = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile1);

    // Record a decision
    await request(app)
      .post(`/candidates/${candidateId}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice: "no_pass" });

    // Verify decision was recorded
    const afterDecision = await request(app)
      .get(`/candidates/${candidateId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterDecision.body.postScreening.recruiterChoice).toBe("no_pass");

    // Re-run post-screening — must clear recruiterChoice + isOverride
    const fakeFile2 = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile2);

    // Verify via DB
    const record = await prisma.postScreening.findUnique({ where: { candidateId } });
    expect(record!.recruiterChoice).toBeNull();
    expect(record!.isOverride).toBeNull();

    // Only one PostScreening record should exist
    const count = await prisma.postScreening.count({ where: { candidateId } });
    expect(count).toBe(1);
  });
});

// ── POST /candidates/:id/post-screen — malformed JSON ────────────────────────

describe("POST /candidates/:id/post-screen — 502 on malformed JSON", () => {
  it("background job sets preScreeningError when Anthropic returns malformed JSON; no PostScreening record written", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    const badResult = { content: [{ type: "text", text: "Not valid JSON!" }] };
    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(badResult)   // first attempt
      .mockResolvedValueOnce(badResult);  // silent retry

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );

    await runPreScreeningAsync(candidateId);

    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    // No PostScreening record should have been written
    const count = await prisma.postScreening.count({ where: { candidateId } });
    expect(count).toBe(0);

    // preScreeningError must be set
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate!.preScreeningError).not.toBeNull();
  });
});

// ── POST /candidates/:id/decision — 404 ──────────────────────────────────────

describe("POST /candidates/:id/decision — 404", () => {
  it("returns 404 when candidateId does not exist", async () => {
    const token = makeAuthToken();

    const res = await request(app)
      .post("/candidates/00000000-0000-0000-0000-000000000000/decision")
      .set("Authorization", `Bearer ${token}`)
      .send({ choice: "pass" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

// ── POST /candidates/:id/decision — 409 ──────────────────────────────────────

describe("POST /candidates/:id/decision — 409", () => {
  it("returns 409 when postScreening does not exist yet", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    const res = await request(app)
      .post(`/candidates/${candidateId}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice: "pass" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Post-screening must be completed before recording a decision");
  });
});

// ── POST /candidates/:id/decision — 400 ──────────────────────────────────────

describe("POST /candidates/:id/decision — 400", () => {
  it("returns 400 when choice is invalid", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );
    await runPreScreeningAsync(candidateId);
    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    const res = await request(app)
      .post(`/candidates/${candidateId}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice: "maybe" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("choice must be 'pass' or 'no_pass'");
  });
});

// ── POST /candidates/:id/decision — confirm (isOverride=false) ────────────────

describe("POST /candidates/:id/decision — confirm", () => {
  it("choice matches aiRecommendation → isOverride=false", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );
    await runPreScreeningAsync(candidateId);
    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    const res = await request(app)
      .post(`/candidates/${candidateId}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice: "pass" });

    expect(res.status).toBe(200);
    expect(res.body.recruiterChoice).toBe("pass");
    expect(res.body.isOverride).toBe(false);
    expect(res.body.aiRecommendation).toBe("pass");
  });
});

// ── POST /candidates/:id/decision — override (isOverride=true) ───────────────

describe("POST /candidates/:id/decision — override", () => {
  it("choice differs from aiRecommendation → isOverride=true", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );
    await runPreScreeningAsync(candidateId);
    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    const res = await request(app)
      .post(`/candidates/${candidateId}/decision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice: "no_pass" });

    expect(res.status).toBe(200);
    expect(res.body.recruiterChoice).toBe("no_pass");
    expect(res.body.isOverride).toBe(true);
    expect(res.body.aiRecommendation).toBe("pass");
  });
});

// ── runPostScreening service unit test ────────────────────────────────────────

describe("runPostScreening — service unit test", () => {
  it("stores reasoningJson as a valid JSON string containing reasoning, keyFindings, confidenceScore", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token);

    mockMessagesCreate
      .mockResolvedValueOnce(preScreenResult)
      .mockResolvedValueOnce(postScreenResult);

    const { runPreScreeningAsync, runPostScreeningAsync } = await import(
      "../controllers/candidates.controller.js"
    );
    await runPreScreeningAsync(candidateId);
    const fakeFile = makeTempTranscriptFile();
    await runPostScreeningAsync(candidateId, fakeFile);

    const record = await prisma.postScreening.findUnique({
      where: { candidateId },
    });

    expect(record).not.toBeNull();
    expect(record!.reasoningJson).toBeTruthy();

    const parsed = JSON.parse(record!.reasoningJson!);
    expect(typeof parsed.reasoning).toBe("string");
    expect(Array.isArray(parsed.keyFindings)).toBe(true);
    expect(typeof parsed.confidenceScore).toBe("number");
    expect(parsed.keyFindings.length).toBeGreaterThanOrEqual(1);
    expect(parsed.keyFindings[0]).toHaveProperty("type");
    expect(parsed.keyFindings[0]).toHaveProperty("description");
  });
});
