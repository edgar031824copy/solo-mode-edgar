import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import path from "path";
import {
  createCandidate,
  listCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
  getCandidateFilePath,
  getCandidateReport,
} from "../services/candidates.service.js";
import { uploadToS3, getS3Stream } from "../services/s3.service.js";
import { runPreScreening } from "../services/screening.service.js";
import { runPostScreening, recordDecision } from "../services/postScreening.service.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

// Zod schema for PUT body — all fields optional for partial update
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  position: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /candidates
 * multipart/form-data — multer memory storage; controller uploads buffers to S3 (F-24)
 */
export async function createCandidateHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, position, notes } = req.body as Record<string, string>;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    // Extract uploaded file buffers — multer memoryStorage populates file.buffer
    const files = req.files as
      | { [fieldname: string]: Express.Multer.File[] }
      | undefined;

    const cvFile = files?.["cv"]?.[0];
    const linkedinFile = files?.["linkedin"]?.[0];

    // Upload files to S3 and store the returned object keys
    const cvFileName = cvFile ? await uploadToS3("cv", cvFile) : null;
    const linkedinFileName = linkedinFile
      ? await uploadToS3("linkedin", linkedinFile)
      : null;

    const candidate = await createCandidate({
      name: name.trim(),
      email: email || null,
      position: position || null,
      notes: notes || null,
      cvFileName,
      linkedinFileName,
    });

    res.status(201).json(candidate);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /candidates
 * Returns all candidates with flattened recruiterChoice (F-14)
 */
export async function listCandidatesHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const candidates = await listCandidates();
    res.json(candidates);
  } catch (err) {
    next(err);
  }
}

type IdParams = { id: string };
type IdTypeParams = { id: string; type: string };

/**
 * GET /candidates/:id
 * Returns full candidate with preScreening + postScreening relations
 */
export async function getCandidateHandler(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const candidate = await getCandidateById(id);

    if (!candidate) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    res.json(candidate);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /candidates/:id
 * Partial update of candidate metadata (name, email, position, notes)
 */
export async function updateCandidateHandler(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    // Prisma throws P2025 if the record doesn't exist — caught below
    const candidate = await updateCandidate(id, data);
    res.json(candidate);
  } catch (err: unknown) {
    // Prisma record-not-found error
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }
    next(err);
  }
}

/**
 * DELETE /candidates/:id
 * Cascade delete removes PreScreening + PostScreening via Prisma onDelete:Cascade
 */
export async function deleteCandidateHandler(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    // Verify existence first to return a clean 404
    const existing = await getCandidateById(id);
    if (!existing) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    await deleteCandidate(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /candidates/:id/pre-screen
 * F-29: Returns 202 immediately; runs Claude pre-screening in background.
 * Sync validation (404/400) happens before 202. preScreeningError cleared before respond.
 */
export async function preScreenCandidateHandler(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  const { id } = req.params;

  // 1. Validate candidate exists and has at least one file (sync checks before 202)
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  if (!candidate.cvFileName && !candidate.linkedinFileName) {
    res.status(400).json({ error: "No CV file found for this candidate" });
    return;
  }

  // 2. Clear any prior async error so polling can detect a fresh failure
  await prisma.candidate.update({
    where: { id },
    data: { preScreeningError: null },
  });

  // 3. Respond 202 immediately — do NOT await the Claude call
  res.status(202).json({ message: "Pre-screening started" });

  // 4. Fire-and-forget (intentionally not awaited)
  void runPreScreeningAsync(id);
}

/**
 * Background helper for pre-screening. Exported for direct testability.
 * On failure: writes error message to Candidate.preScreeningError.
 */
export async function runPreScreeningAsync(candidateId: string): Promise<void> {
  try {
    await runPreScreening(candidateId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Pre-screening failed";
    logger.error("Background pre-screening failed", { candidateId, error: message });
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { preScreeningError: message },
    });
  }
}

/**
 * POST /candidates/:id/post-screen
 * F-29: Returns 202 immediately; runs Claude post-screening in background.
 * Sync validation (400/404) happens before 202. preScreeningError cleared before respond.
 */
export async function postScreenCandidateHandler(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  // 1. Validate transcript is present (sync check before any DB call)
  const transcriptFile = req.file as Express.Multer.File | undefined;
  if (!transcriptFile) {
    res.status(400).json({ error: "Transcript file is required" });
    return;
  }

  const { id } = req.params;

  // 2. Validate candidate exists
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  // 3. Clear any prior async error (shared field reused for both pre/post failures)
  await prisma.candidate.update({
    where: { id },
    data: { preScreeningError: null },
  });

  // 4. Respond 202 immediately
  res.status(202).json({ message: "Post-screening started" });

  // 5. Fire-and-forget
  void runPostScreeningAsync(id, transcriptFile);
}

/**
 * Background helper for post-screening. Exported for direct testability.
 * On failure: writes error message to Candidate.preScreeningError (shared async signal).
 */
export async function runPostScreeningAsync(
  candidateId: string,
  transcriptFile: Express.Multer.File
): Promise<void> {
  try {
    await runPostScreening(candidateId, transcriptFile);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Post-screening failed";
    logger.error("Background post-screening failed", { candidateId, error: message });
    await prisma.candidate.update({
      where: { id: candidateId },
      data: { preScreeningError: message },
    });
  }
}

/**
 * POST /candidates/:id/decision
 * Records recruiter's confirm/override choice. Computes isOverride server-side.
 * Logs decision for F-11 audit.
 */
export async function recordDecisionHandler(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  try {
    const { choice } = req.body as { choice?: string };

    if (choice !== "pass" && choice !== "no_pass") {
      res.status(400).json({ error: "choice must be 'pass' or 'no_pass'" });
      return;
    }

    const result = await recordDecision(req.params.id, choice as "pass" | "no_pass");
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const status = e.status ?? 500;
    res.status(status).json({ error: e.message ?? "Internal server error" });
  }
}

/**
 * GET /candidates/:id/report
 * F-12: Returns the full candidate report as JSON (candidate + preScreening + postScreening).
 * Client-side download triggered by the FE via Blob + URL.createObjectURL.
 */
export async function getReportHandler(
  req: Request<IdParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const report = await getCandidateReport(id);

    if (!report) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    res.json(report);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /candidates/:id/files/:type
 * Epic 6 (F-24): Stream file from private S3 uploads bucket instead of local disk.
 * getCandidateFilePath returns the S3 key stored in cvFileName / linkedinFileName.
 */
export async function getCandidateFileHandler(
  req: Request<IdTypeParams>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, type } = req.params;

    if (type !== "cv" && type !== "linkedin") {
      res.status(400).json({ error: "Invalid file type" });
      return;
    }

    const result = await getCandidateFilePath(id, type as "cv" | "linkedin");
    if (!result) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // result.fileName is the S3 key (e.g. "cv/1715000000-resume.pdf")
    const s3Key = result.fileName;

    let stream: NodeJS.ReadableStream;
    try {
      stream = await getS3Stream(s3Key);
    } catch {
      // S3 errors (NoSuchKey, auth failure) surface as 502 — the key was stored but
      // the object is no longer accessible (deleted externally, wrong bucket, etc.)
      res.status(502).json({ error: "File could not be retrieved from storage" });
      return;
    }

    // Let the browser determine content type from extension; force inline view
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(s3Key)}"`
    );
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
