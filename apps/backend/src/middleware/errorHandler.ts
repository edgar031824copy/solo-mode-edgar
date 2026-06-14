import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

// Global Express error handler — must have four params to be recognized as error middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  logger.error("Unhandled error", { message: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
}
