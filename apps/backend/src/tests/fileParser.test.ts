/**
 * fileParser.service.ts unit tests
 *
 * Key regression: [EPIC-3][HIGH] — pdf-parse self-test ENOENT fix.
 * The dynamic `import("pdf-parse")` caused the package's self-test to run on
 * load, throwing ENOENT for a missing test fixture and making parsePdf() silently
 * return "". The fix imports `pdf-parse/lib/pdf-parse.js` directly (no self-test).
 * This test confirms that parsePdf() returns non-empty text from a real PDF buffer.
 *
 * Epic 6 addition: parsePdfBuffer(buffer) — same parser, accepts Buffer directly.
 * Used by screening.service.ts when reading CV/LinkedIn files from S3 (F-24).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parsePdf, parsePdfBuffer, readTextFile } from "../services/fileParser.service.js";
import { writeFileSync, unlinkSync } from "fs";
import os from "os";

// ── parsePdf ─────────────────────────────────────────────────────────────────

describe("parsePdf", () => {
  it("returns non-empty text from a valid PDF buffer (regression: EPIC-3-HIGH pdf-parse self-test fix)", async () => {
    // Use the test PDF shipped with the pdf-parse package itself — present on disk in node_modules
    const pdfPath = path.resolve(
      "node_modules/pdf-parse/test/data/05-versions-space.pdf"
    );
    const buf = readFileSync(pdfPath);

    // Write to a temp file so parsePdf (which reads from disk) can access it
    const tmpPath = path.join(os.tmpdir(), `vitest-pdf-${Date.now()}.pdf`);
    writeFileSync(tmpPath, buf);

    try {
      const text = await parsePdf(tmpPath);
      // The PDF contains at least some whitespace/text — must not be empty string
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("returns empty string when file does not exist (non-fatal fallback)", async () => {
    const text = await parsePdf("/nonexistent/path/file.pdf");
    expect(text).toBe("");
  });
});

// ── parsePdfBuffer ────────────────────────────────────────────────────────────
// Epic 6 (F-24): buffer variant used by screening.service.ts after reading from S3

describe("parsePdfBuffer", () => {
  it("returns non-empty text from a valid PDF buffer (same parser, buffer input)", async () => {
    // Use the same test PDF from node_modules — read directly as buffer
    const pdfPath = path.resolve(
      "node_modules/pdf-parse/test/data/05-versions-space.pdf"
    );
    const buf = readFileSync(pdfPath);

    const text = await parsePdfBuffer(buf);

    expect(typeof text).toBe("string");
    // The test PDF contains real text — must not be empty
    expect(text.length).toBeGreaterThan(0);
  });

  it("returns empty string on invalid PDF buffer (non-fatal fallback)", async () => {
    const buf = Buffer.from("this is not a pdf");
    const text = await parsePdfBuffer(buf);
    expect(text).toBe("");
  });
});

// ── readTextFile ──────────────────────────────────────────────────────────────

describe("readTextFile", () => {
  it("reads a plain text file and returns its contents", async () => {
    const tmpPath = path.join(os.tmpdir(), `vitest-txt-${Date.now()}.txt`);
    writeFileSync(tmpPath, "Hello, world!");

    try {
      const text = await readTextFile(tmpPath);
      expect(text).toBe("Hello, world!");
    } finally {
      unlinkSync(tmpPath);
    }
  });

  it("returns empty string when file does not exist (non-fatal fallback)", async () => {
    const text = await readTextFile("/nonexistent/path/file.txt");
    expect(text).toBe("");
  });
});
