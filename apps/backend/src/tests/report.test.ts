import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { makeAuthToken } from "./helpers/auth.js";

const app = createApp();

afterEach(async () => {
  await prisma.candidate.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── GET /candidates/:id/report ────────────────────────────────────────────────

describe("GET /candidates/:id/report", () => {
  it("returns 404 for unknown candidate id", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .get("/candidates/00000000-0000-0000-0000-000000000000/report")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });

  it("returns 401 when no auth token", async () => {
    const res = await request(app).get(
      "/candidates/00000000-0000-0000-0000-000000000000/report"
    );
    expect(res.status).toBe(401);
  });

  it("returns report with null preScreening and postScreening for fresh candidate", async () => {
    const token = makeAuthToken();

    // Create a candidate without any screening
    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Report Test Candidate")
      .field("email", "report@example.com")
      .field("position", "Senior Engineer");

    expect(created.status).toBe(201);
    const candidateId = created.body.id as string;

    const res = await request(app)
      .get(`/candidates/${candidateId}/report`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    // candidate block
    expect(res.body.candidate).toBeDefined();
    expect(res.body.candidate.id).toBe(candidateId);
    expect(res.body.candidate.name).toBe("Report Test Candidate");
    expect(res.body.candidate.email).toBe("report@example.com");
    expect(res.body.candidate.position).toBe("Senior Engineer");
    expect(res.body.candidate.status).toBe("pending");
    expect(res.body.candidate.createdAt).toBeDefined();
    expect(res.body.candidate.updatedAt).toBeDefined();

    // no screening yet — both must be null
    expect(res.body.preScreening).toBeNull();
    expect(res.body.postScreening).toBeNull();
  });

  it("returns report with preScreening populated when pre-screening exists", async () => {
    const token = makeAuthToken();

    // Create candidate
    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Pre-Screened Candidate");
    const candidateId = created.body.id as string;

    // Manually insert a PreScreening record via Prisma
    const redFlags = [
      {
        claim: "Short tenure at previous job",
        source: "cv",
        severity: "medium",
        validationQuestion: "Why did you leave after 6 months?",
      },
    ];
    const questions = [
      {
        question: "Can you describe your experience?",
        rationale: "Profile verification",
        type: "verification",
      },
      {
        question: "How do you handle conflict?",
        rationale: "Role fit",
        type: "role-fit",
      },
    ];

    await prisma.preScreening.create({
      data: {
        candidateId,
        profileSummary: "Strong backend engineer with 5 years of experience.",
        redFlagsJson: JSON.stringify(redFlags),
        interviewQuestionsJson: JSON.stringify(questions),
        overallFit: 4,
      },
    });
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "pre_screened" },
    });

    const res = await request(app)
      .get(`/candidates/${candidateId}/report`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    // preScreening populated
    expect(res.body.preScreening).not.toBeNull();
    expect(res.body.preScreening.profileSummary).toBe(
      "Strong backend engineer with 5 years of experience."
    );
    expect(res.body.preScreening.overallFit).toBe(4);
    expect(Array.isArray(res.body.preScreening.redFlags)).toBe(true);
    expect(res.body.preScreening.redFlags).toHaveLength(1);
    expect(res.body.preScreening.redFlags[0].claim).toBe(
      "Short tenure at previous job"
    );
    expect(Array.isArray(res.body.preScreening.interviewQuestions)).toBe(true);
    expect(res.body.preScreening.interviewQuestions).toHaveLength(2);

    // postScreening absent
    expect(res.body.postScreening).toBeNull();
  });

  it("returns report with postScreening populated when post-screening exists", async () => {
    const token = makeAuthToken();

    // Create candidate + pre-screening (required FK)
    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Post-Screened Candidate");
    const candidateId = created.body.id as string;

    await prisma.preScreening.create({
      data: {
        candidateId,
        profileSummary: "Solid candidate.",
        redFlagsJson: JSON.stringify([]),
        interviewQuestionsJson: JSON.stringify([]),
        overallFit: 3,
      },
    });

    const reasoning = {
      reasoning: "The candidate answered all questions well.",
      keyFindings: [
        {
          type: "strength",
          description: "Clear communication skills",
          relatedQuestion: "Tell me about yourself",
        },
      ],
      confidenceScore: 4,
    };

    await prisma.postScreening.create({
      data: {
        candidateId,
        transcriptFileName: "transcript.txt",
        aiRecommendation: "pass",
        recruiterChoice: "pass",
        isOverride: false,
        reasoningJson: JSON.stringify(reasoning),
      },
    });
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "decided" },
    });

    const res = await request(app)
      .get(`/candidates/${candidateId}/report`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    expect(res.body.postScreening).not.toBeNull();
    expect(res.body.postScreening.transcriptFileName).toBe("transcript.txt");
    expect(res.body.postScreening.aiRecommendation).toBe("pass");
    expect(res.body.postScreening.recruiterChoice).toBe("pass");
    expect(res.body.postScreening.isOverride).toBe(false);
    expect(res.body.postScreening.reasoning).not.toBeNull();
    expect(res.body.postScreening.reasoning.reasoning).toBe(
      "The candidate answered all questions well."
    );
    expect(res.body.postScreening.reasoning.confidenceScore).toBe(4);
    expect(res.body.postScreening.createdAt).toBeDefined();
    expect(res.body.postScreening.updatedAt).toBeDefined();
  });

  it("returns postScreening.reasoning as null when reasoningJson is absent or unparseable", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Bad JSON Candidate");
    const candidateId = created.body.id as string;

    await prisma.preScreening.create({
      data: {
        candidateId,
        profileSummary: "OK.",
        redFlagsJson: JSON.stringify([]),
        interviewQuestionsJson: JSON.stringify([]),
        overallFit: 2,
      },
    });

    // Store invalid JSON in reasoningJson
    await prisma.postScreening.create({
      data: {
        candidateId,
        transcriptFileName: "t.txt",
        aiRecommendation: "no_pass",
        reasoningJson: "{not valid json}",
      },
    });

    const res = await request(app)
      .get(`/candidates/${candidateId}/report`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.postScreening).not.toBeNull();
    expect(res.body.postScreening.reasoning).toBeNull();
  });

  it("returns empty arrays for preScreening redFlags and interviewQuestions when JSON is invalid", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Bad PreScreen JSON Candidate");
    const candidateId = created.body.id as string;

    await prisma.preScreening.create({
      data: {
        candidateId,
        profileSummary: "Some summary",
        redFlagsJson: "not-valid-json",
        interviewQuestionsJson: "also-not-valid",
        overallFit: 3,
      },
    });

    const res = await request(app)
      .get(`/candidates/${candidateId}/report`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.preScreening.redFlags).toEqual([]);
    expect(res.body.preScreening.interviewQuestions).toEqual([]);
  });
});
