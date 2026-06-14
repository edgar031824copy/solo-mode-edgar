import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { makeAuthToken } from "./helpers/auth.js";

// ── S3 service mock — must be hoisted before app import resolves the module ────
// uploadToS3 returns a deterministic S3 key so assertions are predictable
vi.mock("../services/s3.service.js", () => ({
  uploadToS3: vi.fn().mockImplementation(async (folder: string, file: Express.Multer.File) => {
    return `${folder}/${Date.now()}-${file.originalname}`;
  }),
  getS3Stream: vi.fn().mockImplementation(async (_key: string) => {
    const { Readable } = await import("stream");
    const stream = Readable.from(["mock-file-content"]);
    return stream;
  }),
  getS3Buffer: vi.fn().mockImplementation(async (_key: string) => {
    return Buffer.from("mock-file-content");
  }),
}));

const app = createApp();

// Clean up all candidates created during tests after each test so tests are isolated
afterEach(async () => {
  await prisma.candidate.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── POST /candidates ──────────────────────────────────────────────────────────

describe("POST /candidates", () => {
  it("creates candidate with name only (no files) → 201 with status pending", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Alice Smith");

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("Alice Smith");
    expect(res.body.status).toBe("pending");
    expect(res.body.cvFileName).toBeNull();
    expect(res.body.linkedinFileName).toBeNull();
  });

  it("creates candidate with name + cv file → 201, cvFileName is S3 key (cv/...)", async () => {
    const token = makeAuthToken();
    const buf = Buffer.from("%PDF-1.4 stub content");

    const res = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Bob Jones")
      .attach("cv", buf, { filename: "resume.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.cvFileName).not.toBeNull();
    expect(typeof res.body.cvFileName).toBe("string");
    // After S3 migration, cvFileName must be an S3 key with "cv/" prefix
    expect(res.body.cvFileName).toMatch(/^cv\/.+/);
  });

  it("creates candidate with both cv and linkedin → cvFileName and linkedinFileName are S3 keys", async () => {
    const token = makeAuthToken();
    const buf = Buffer.from("mock content");

    const res = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Carol White")
      .attach("cv", buf, { filename: "cv.pdf", contentType: "application/pdf" })
      .attach("linkedin", buf, { filename: "linkedin.txt", contentType: "text/plain" });

    expect(res.status).toBe(201);
    expect(res.body.cvFileName).toMatch(/^cv\/.+/);
    expect(res.body.linkedinFileName).toMatch(/^linkedin\/.+/);
  });

  it("returns 400 when name is missing", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("email", "test@example.com");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("name is required");
  });

  it("returns 401 when no auth token", async () => {
    const res = await request(app)
      .post("/candidates")
      .field("name", "No Auth");

    expect(res.status).toBe(401);
  });
});

// ── GET /candidates ───────────────────────────────────────────────────────────

describe("GET /candidates", () => {
  it("returns empty array when no candidates exist", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .get("/candidates")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns array with recruiterChoice field on each candidate", async () => {
    const token = makeAuthToken();

    // Create a candidate first
    await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Charlie Brown");

    const res = await request(app)
      .get("/candidates")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // recruiterChoice must be present (null until PostScreening is populated)
    expect(Object.prototype.hasOwnProperty.call(res.body[0], "recruiterChoice")).toBe(true);
    expect(res.body[0].recruiterChoice).toBeNull();
  });

  it("returns 401 when no auth token", async () => {
    const res = await request(app).get("/candidates");
    expect(res.status).toBe(401);
  });
});

// ── GET /candidates/:id ───────────────────────────────────────────────────────

describe("GET /candidates/:id", () => {
  it("returns full candidate with null preScreening and postScreening", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Diana Prince")
      .field("notes", "Some notes");

    const res = await request(app)
      .get(`/candidates/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.name).toBe("Diana Prince");
    expect(res.body.notes).toBe("Some notes");
    expect(res.body.preScreening).toBeNull();
    expect(res.body.postScreening).toBeNull();
  });

  it("returns 404 for unknown id", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .get("/candidates/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });

  it("returns 401 when no auth token", async () => {
    const res = await request(app).get("/candidates/some-id");
    expect(res.status).toBe(401);
  });
});

// ── PUT /candidates/:id ───────────────────────────────────────────────────────

describe("PUT /candidates/:id", () => {
  it("updates notes field and returns full candidate", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Eve Adams");

    const res = await request(app)
      .put(`/candidates/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Updated notes here" });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Updated notes here");
    expect(res.body.preScreening).toBeNull();
    expect(res.body.postScreening).toBeNull();
  });

  it("returns 404 for unknown id", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .put("/candidates/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "anything" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

// ── DELETE /candidates/:id ────────────────────────────────────────────────────

describe("DELETE /candidates/:id", () => {
  it("returns 204 and candidate is gone from GET", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Frank Castle");

    const del = await request(app)
      .delete(`/candidates/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(del.status).toBe(204);

    const getRes = await request(app)
      .get(`/candidates/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const token = makeAuthToken();
    const res = await request(app)
      .delete("/candidates/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

// ── GET /candidates/:id/files/:type — S3 stream ───────────────────────────────

describe("GET /candidates/:id/files/:type", () => {
  it("returns 200 and streams file content when S3 key exists", async () => {
    const token = makeAuthToken();
    const buf = Buffer.from("mock pdf content");

    // Create candidate with a CV (mock uploadToS3 returns cv/... key)
    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Grace Hopper")
      .attach("cv", buf, { filename: "cv.pdf", contentType: "application/pdf" });

    expect(created.status).toBe(201);
    expect(created.body.cvFileName).toMatch(/^cv\/.+/);

    const res = await request(app)
      .get(`/candidates/${created.body.id}/files/cv`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("returns 404 when candidate has no cv file", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "No File Person");

    const res = await request(app)
      .get(`/candidates/${created.body.id}/files/cv`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid file type", async () => {
    const token = makeAuthToken();

    const created = await request(app)
      .post("/candidates")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Bad Type Test");

    const res = await request(app)
      .get(`/candidates/${created.body.id}/files/transcript`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
