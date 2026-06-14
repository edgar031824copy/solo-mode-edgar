import express from "express";
import cors from "cors";
import { mkdirSync } from "fs";

// Epic 6 (F-24): uploads/cv and uploads/linkedin removed — files now stored in S3.
// uploads/transcript remains on disk (post-screening transcript is not in F-24 scope).
mkdirSync("uploads/transcript", { recursive: true });
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import candidatesRouter from "./routes/candidates.js";
import screeningRouter from "./routes/screening.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./lib/logger.js";

export function createApp() {
  const app = express();

  // CORS — allow the FE origin configured via env
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    })
  );

  app.use(express.json());

  // NF-07 — request-level structured logging; fires on response finish to capture final status code
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration_ms = Date.now() - start;
      const meta = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration_ms,
        ...(req.params?.id ? { candidateId: req.params.id } : {}),
      };
      if (res.statusCode >= 500) logger.error("Request completed", meta);
      else if (res.statusCode >= 400) logger.warn("Request completed", meta);
      else logger.info("Request completed", meta);
    });
    next();
  });

  // Public routes — no auth required
  app.use(healthRouter);
  app.use(authRouter);

  // All subsequent routes require a valid JWT
  app.use(authMiddleware);
  app.use(candidatesRouter);
  app.use(screeningRouter);

  // Must be registered last — catches errors thrown by any route
  app.use(errorHandler);

  return app;
}
