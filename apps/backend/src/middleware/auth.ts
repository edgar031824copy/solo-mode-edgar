import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request to carry the decoded JWT payload
declare global {
  namespace Express {
    interface Request {
      recruiter?: {
        sub: string;
        email: string;
        name: string;
        iat: number;
        exp: number;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  const token = header.slice(7);

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured");

    const decoded = jwt.verify(token, secret) as {
      sub: string;
      email: string;
      name: string;
      iat: number;
      exp: number;
    };

    req.recruiter = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
