import { generateToken } from "../../services/auth.service.js";

const TEST_RECRUITER = {
  sub:   "00000000-0000-0000-0000-000000000001",
  email: "recruiter@gorilla.com",
  name:  "Gorilla Recruiter",
};

export function makeAuthToken(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  return generateToken(TEST_RECRUITER, secret);
}

export function makeAuthHeader(): string {
  return `Bearer ${makeAuthToken()}`;
}
