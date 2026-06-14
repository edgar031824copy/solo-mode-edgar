import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

export async function findRecruiterByEmail(email: string) {
  return prisma.recruiter.findUnique({ where: { email } });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateToken(
  payload: { sub: string; email: string; name: string },
  secret: string
): string {
  return jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}
