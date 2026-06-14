/**
 * screening.test.ts
 * Tests for POST /candidates/:id/pre-screen.
 * F-29: Endpoint now returns 202 immediately and runs Claude in background.
 * Background job results are verified via DB queries or by calling the exported
 * runPreScreeningAsync helper directly.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { makeAuthToken } from "./helpers/auth.js";

// ── Anthropic mock — must be hoisted before any service import ────────────────
const VALID_RESPONSE = JSON.stringify({
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

// Shared mock function — tests can override with mockResolvedValueOnce
const mockMessagesCreate = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: VALID_RESPONSE }],
});

vi.mock("@anthropic-ai/sdk", () => {
  // Use a named function so Vitest recognises it as a constructor
  function MockAnthropic() {
    return {
      messages: {
        create: mockMessagesCreate,
      },
    };
  }
  return { default: MockAnthropic };
});

// ── S3 service mock ─────────────────────────────────────────────────────────────
vi.mock("../services/s3.service.js", () => ({
  uploadToS3: vi.fn().mockImplementation(async (folder: string, file: { originalname: string }) => {
    return `${folder}/${Date.now()}-${file.originalname}`;
  }),
  getS3Stream: vi.fn().mockResolvedValue(null),
  getS3Buffer: vi.fn().mockResolvedValue(
    Buffer.from("John Doe - Software Engineer\nExperience: 5 years TypeScript")
  ),
}));

// ── App + helpers ─────────────────────────────────────────────────────────────

const app = createApp();

async function createCandidateWithCv(
  token: string,
  opts: { withCv?: boolean; position?: string } = {}
): Promise<string> {
  const req = request(app)
    .post("/candidates")
    .set("Authorization", `Bearer ${token}`)
    .field("name", "Test Candidate");

  if (opts.position) req.field("position", opts.position);

  if (opts.withCv) {
    const buf = Buffer.from(
      "John Doe - Software Engineer\nExperience: 5 years TypeScript"
    );
    req.attach("cv", buf, {
      filename: "test-cv.txt",
      contentType: "text/plain",
    });
  }

  const res = await req;
  return res.body.id as string;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

beforeEach(async () => {
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: "text", text: VALID_RESPONSE }],
  });
});

afterEach(async () => {
  await prisma.preScreening.deleteMany();
  await prisma.candidate.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /candidates/:id/pre-screen — 404 ─────────────────────────────────────

describe("POST /candidates/:id/pre-screen — 404", () => {
  it("returns 404 when candidate does not exist", async () => {
    const token = makeAuthToken();

    const res = await request(app)
      .post("/candidates/00000000-0000-0000-0000-000000000000/pre-screen")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

// ── POST /candidates/:id/pre-screen — 400 ─────────────────────────────────────

describe("POST /candidates/:id/pre-screen — 400", () => {
  it("returns 400 when candidate has no CV and no LinkedIn file", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token, { withCv: false });

    const res = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

// ── POST /candidates/:id/pre-screen — 202 (F-29 async) ───────────────────────

describe("POST /candidates/:id/pre-screen — 202", () => {
  it("returns 202 with PreScreening record written after awaiting background job", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token, {
      withCv: true,
      position: "Senior Engineer",
    });

    const res = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);

    // F-29: response is 202 immediately
    expect(res.status).toBe(202);
    expect(res.body.message).toBe("Pre-screening started");

    // Await background job completion via exported helper to verify DB state
    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");
    await runPreScreeningAsync(candidateId);

    const record = await prisma.preScreening.findUnique({ where: { candidateId } });
    expect(record).not.toBeNull();
    expect(typeof record!.profileSummary).toBe("string");
    expect(record!.profileSummary!.length).toBeGreaterThan(0);
    expect(record!.redFlagsJson).toBeTruthy();
    expect(record!.interviewQuestionsJson).toBeTruthy();
    expect(typeof record!.overallFit).toBe("number");
  });

  it("candidate status advances to pre_screened after background job completes", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token, { withCv: true });

    await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);

    // Drive the background job to completion
    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");
    await runPreScreeningAsync(candidateId);

    const candidateRes = await request(app)
      .get(`/candidates/${candidateId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(candidateRes.body.status).toBe("pre_screened");
  });
});

// ── POST /candidates/:id/pre-screen — upsert ─────────────────────────────────

describe("POST /candidates/:id/pre-screen — upsert", () => {
  it("calling background job twice overwrites existing PreScreening record; only one record exists", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token, { withCv: true });

    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");

    // First run
    const first = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(202);
    await runPreScreeningAsync(candidateId);

    const firstRecord = await prisma.preScreening.findUnique({ where: { candidateId } });
    expect(firstRecord).not.toBeNull();
    const firstId = firstRecord!.id;

    // Second run
    const second = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(202);
    await runPreScreeningAsync(candidateId);

    // Only one PreScreening record should exist for this candidate
    const count = await prisma.preScreening.count({ where: { candidateId } });
    expect(count).toBe(1);

    // Upsert keeps same id (update path)
    const secondRecord = await prisma.preScreening.findUnique({ where: { candidateId } });
    expect(secondRecord!.id).toBe(firstId);

    // Candidate status stays pre_screened
    const candidateRes = await request(app)
      .get(`/candidates/${candidateId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(candidateRes.body.status).toBe("pre_screened");
  });
});

// ── POST /candidates/:id/pre-screen — malformed JSON ─────────────────────────

describe("POST /candidates/:id/pre-screen — malformed JSON from Anthropic", () => {
  it("background job sets preScreeningError when Anthropic returns malformed JSON; no PreScreening record written", async () => {
    // Override mock to return invalid JSON for this test (both attempts — retry also fails)
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "This is not valid JSON at all!" }],
    });

    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token, { withCv: true });

    // Trigger via HTTP — response is 202 immediately
    const res = await request(app)
      .post(`/candidates/${candidateId}/pre-screen`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(202);

    // Drive the background job — it will fail and write preScreeningError
    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");
    await runPreScreeningAsync(candidateId);

    // No PreScreening record should have been written
    const count = await prisma.preScreening.count({ where: { candidateId } });
    expect(count).toBe(0);

    // preScreeningError must be set on the Candidate
    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    expect(candidate!.preScreeningError).not.toBeNull();
    expect(typeof candidate!.preScreeningError).toBe("string");
  });
});

// ── runPreScreening service unit test ─────────────────────────────────────────

describe("runPreScreening — service unit test", () => {
  it("stores redFlagsJson and interviewQuestionsJson as valid JSON strings in DB", async () => {
    const token = makeAuthToken();
    const candidateId = await createCandidateWithCv(token, {
      withCv: true,
      position: "Backend Engineer",
    });

    // Drive background job directly
    const { runPreScreeningAsync } = await import("../controllers/candidates.controller.js");
    await runPreScreeningAsync(candidateId);

    // Verify persisted record via Prisma
    const record = await prisma.preScreening.findUnique({
      where: { candidateId },
    });

    expect(record).not.toBeNull();

    // redFlagsJson must be parseable as an array with correct shape
    const redFlags = JSON.parse(record!.redFlagsJson!);
    expect(Array.isArray(redFlags)).toBe(true);
    expect(redFlags[0]).toHaveProperty("claim");
    expect(redFlags[0]).toHaveProperty("source");
    expect(redFlags[0]).toHaveProperty("severity");
    expect(redFlags[0]).toHaveProperty("validationQuestion");

    // interviewQuestionsJson must be parseable as an array of 5
    const questions = JSON.parse(record!.interviewQuestionsJson!);
    expect(Array.isArray(questions)).toBe(true);
    expect(questions).toHaveLength(5);
    expect(questions[0]).toHaveProperty("question");
    expect(questions[0]).toHaveProperty("rationale");
    expect(questions[0]).toHaveProperty("type");
  });
});
