import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("POST /auth/login", () => {
  it("returns 200 with token and recruiter on valid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "recruiter@gorilla.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(res.body.recruiter.email).toBe("recruiter@gorilla.com");
    expect(res.body.recruiter.name).toBe("Gorilla Recruiter");
    expect(typeof res.body.recruiter.id).toBe("string");
    // passwordHash must never appear in the response
    expect(res.body.recruiter.passwordHash).toBeUndefined();
  });

  it("returns 400 when email is missing", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email and password are required");
  });

  it("returns 400 when password is missing", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "recruiter@gorilla.com" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email and password are required");
  });

  it("returns 400 when body is empty", async () => {
    const res = await request(app).post("/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email and password are required");
  });

  it("returns 401 on wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "recruiter@gorilla.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("returns 401 when email does not exist", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });
});

describe("Auth middleware", () => {
  it("returns 401 with correct error when Authorization header is missing on a protected route", async () => {
    // Use a future route path — even a 404 from a missing route still goes through auth middleware
    // We need a route that is actually protected. For now test against a non-existent protected path.
    // The auth middleware runs before the router so it will fire and return 401.
    const res = await request(app).get("/api/protected-test");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authorization header required");
  });

  it("returns 401 with correct error when token is invalid", async () => {
    const res = await request(app)
      .get("/api/protected-test")
      .set("Authorization", "Bearer invalid.token.here");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
  });
});
