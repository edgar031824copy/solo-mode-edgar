import { Request, Response } from "express";
import { z } from "zod";
import {
  findRecruiterByEmail,
  verifyPassword,
  generateToken,
} from "../services/auth.service.js";

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response): Promise<void> {
  // Validate presence of both fields before any DB work
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const { email, password } = parsed.data;

  const recruiter = await findRecruiterByEmail(email);

  // Return 401 whether the email doesn't exist or password is wrong — don't leak which failed
  if (!recruiter || !(await verifyPassword(password, recruiter.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const secret = process.env.JWT_SECRET!;
  const token = generateToken(
    { sub: recruiter.id, email: recruiter.email, name: recruiter.name },
    secret
  );

  res.status(200).json({
    token,
    recruiter: {
      id: recruiter.id,
      email: recruiter.email,
      name: recruiter.name,
    },
  });
}
