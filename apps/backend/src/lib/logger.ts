import pino from "pino";

// Thin pino adapter preserving existing (msg, meta?) call sites across the codebase.
// pino's native API is (mergeObject, message) but all existing callers use (message, meta?).
const _pino = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  // In dev: pretty-print for readability; in prod: raw JSON for log aggregators
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

export const logger = {
  info:  (msg: string, meta?: object) => _pino.info(meta ?? {}, msg),
  warn:  (msg: string, meta?: object) => _pino.warn(meta ?? {}, msg),
  error: (msg: string, meta?: object) => _pino.error(meta ?? {}, msg),
  debug: (msg: string, meta?: object) => _pino.debug(meta ?? {}, msg),
};
