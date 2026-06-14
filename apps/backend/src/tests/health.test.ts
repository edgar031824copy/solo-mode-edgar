import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("GET /health", () => {
  it("returns 200 with status ok and an ISO timestamp", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.timestamp).toBe("string");
    // Verify it is a valid ISO-8601 date string
    expect(() => new Date(res.body.timestamp).toISOString()).not.toThrow();
  });
});
