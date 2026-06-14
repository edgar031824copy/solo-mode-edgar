import fs from "fs/promises";
// Import the underlying pdf-parse parser directly to skip its self-test on load.
// The self-test (run by the package's index.js entry point) tries to read
// ./test/data/05-versions-space.pdf, which does not exist in production and throws ENOENT.
// Importing the lib directly bypasses that self-test entirely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import pdfParse from "pdf-parse/lib/pdf-parse.js";

/**
 * Extracts text from a PDF file at the given path.
 * Returns empty string on any error (non-fatal — callers handle missing text).
 */
export async function parsePdf(filePath: string): Promise<string> {
  try {
    const buf = await fs.readFile(filePath);
    const result = await pdfParse(buf);
    return result.text ?? "";
  } catch (err) {
    console.error("parsePdf error:", err);
    return "";
  }
}

/**
 * Parse a PDF from an in-memory Buffer.
 * Epic 6 (F-24): used by screening.service.ts after reading CV/LinkedIn files from S3.
 * Uses the same pdf-parse/lib/pdf-parse.js import — no self-test triggered.
 * Returns "" on error — non-fatal, callers handle missing text.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text ?? "";
  } catch (err) {
    console.error("parsePdfBuffer error:", err);
    return "";
  }
}

/**
 * Reads a plain-text file as UTF-8.
 * Returns empty string on any error.
 */
export async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (err) {
    console.error("readTextFile error:", err);
    return "";
  }
}
