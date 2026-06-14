import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import path from "path";
import { logger } from "../lib/logger.js";

// Shape for the list endpoint — includes flattened recruiterChoice
export interface CandidateListItem {
  id: string;
  name: string;
  email: string | null;
  position: string | null;
  status: string;
  cvFileName: string | null;
  linkedinFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
  recruiterChoice: string | null;
}

// Full include used for detail/update responses
const candidateInclude = {
  preScreening: true,
  postScreening: true,
} as const;

/**
 * Create a new Candidate record.
 * cvFileName/linkedinFileName are the stored filenames (not full paths).
 */
export async function createCandidate(data: {
  name: string;
  email?: string | null;
  position?: string | null;
  notes?: string | null;
  cvFileName?: string | null;
  linkedinFileName?: string | null;
}) {
  return prisma.candidate.create({
    data: {
      name: data.name,
      email: data.email ?? null,
      position: data.position ?? null,
      notes: data.notes ?? null,
      cvFileName: data.cvFileName ?? null,
      linkedinFileName: data.linkedinFileName ?? null,
    },
  });
}

/**
 * List all candidates ordered by createdAt descending.
 * Flattens PostScreening.recruiterChoice into the top-level response (F-14).
 */
export async function listCandidates(): Promise<CandidateListItem[]> {
  const rows = await prisma.candidate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      postScreening: { select: { recruiterChoice: true } },
    },
  });

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    position: c.position,
    status: c.status,
    cvFileName: c.cvFileName,
    linkedinFileName: c.linkedinFileName,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    // Flatten nullable nested relation
    recruiterChoice: c.postScreening?.recruiterChoice ?? null,
  }));
}

/**
 * Get a single candidate with full preScreening + postScreening relations.
 * Returns null if not found.
 */
export async function getCandidateById(id: string) {
  return prisma.candidate.findUnique({
    where: { id },
    include: candidateInclude,
  });
}

/**
 * Partially update candidate metadata fields.
 * Throws if candidate not found (Prisma P2025 error — caller maps to 404).
 */
export async function updateCandidate(
  id: string,
  data: {
    name?: string;
    email?: string;
    position?: string;
    notes?: string;
  }
) {
  return prisma.candidate.update({
    where: { id },
    data,
    include: candidateInclude,
  });
}

/**
 * Delete a candidate. Prisma cascade removes PreScreening + PostScreening.
 * Throws if candidate not found (Prisma P2025 — caller maps to 404).
 */
export async function deleteCandidate(id: string) {
  return prisma.candidate.delete({ where: { id } });
}

// ── F-12 Report types ─────────────────────────────────────────────────────────

export interface CandidateReport {
  candidate: {
    id: string;
    name: string;
    email: string | null;
    position: string | null;
    notes: string | null;
    cvFileName: string | null;
    linkedinFileName: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  preScreening: {
    profileSummary: string | null;
    redFlags: Array<{
      claim: string;
      source: "cv" | "linkedin" | "gap";
      severity: "high" | "medium" | "low";
      validationQuestion: string;
    }>;
    interviewQuestions: Array<{
      question: string;
      rationale: string;
      type: "verification" | "role-fit";
    }>;
    overallFit: number | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  postScreening: {
    transcriptFileName: string | null;
    aiRecommendation: string | null;
    recruiterChoice: string | null;
    isOverride: boolean | null;
    reasoning: {
      reasoning: string;
      keyFindings: Array<{
        type: string;
        description: string;
        relatedQuestion: string;
      }>;
      confidenceScore: number;
    } | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
}

/**
 * Assemble the full candidate report for F-12.
 * Parses stored JSON fields server-side; returns null for fields whose JSON is malformed.
 * Returns null if candidate not found.
 */
export async function getCandidateReport(
  id: string
): Promise<CandidateReport | null> {
  const candidate = await getCandidateById(id);

  if (!candidate) return null;

  // ── preScreening block ────────────────────────────────────────────────────
  let preScreeningBlock: CandidateReport["preScreening"] = null;

  if (candidate.preScreening) {
    const ps = candidate.preScreening;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let redFlags: any[] = [];
    try {
      redFlags = JSON.parse(ps.redFlagsJson ?? "[]");
    } catch {
      // Malformed stored JSON — return empty array and log; do not surface 500 to client
      logger.warn("getCandidateReport: failed to parse redFlagsJson", { candidateId: id });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let interviewQuestions: any[] = [];
    try {
      interviewQuestions = JSON.parse(ps.interviewQuestionsJson ?? "[]");
    } catch {
      logger.warn("getCandidateReport: failed to parse interviewQuestionsJson", { candidateId: id });
    }

    preScreeningBlock = {
      profileSummary: ps.profileSummary,
      redFlags,
      interviewQuestions,
      overallFit: ps.overallFit,
      createdAt: ps.createdAt.toISOString(),
      updatedAt: ps.updatedAt.toISOString(),
    };
  }

  // ── postScreening block ───────────────────────────────────────────────────
  let postScreeningBlock: CandidateReport["postScreening"] = null;

  if (candidate.postScreening) {
    const post = candidate.postScreening;

    let reasoning: CandidateReport["postScreening"] extends null
      ? never
      : NonNullable<CandidateReport["postScreening"]>["reasoning"] = null;
    if (post.reasoningJson) {
      try {
        reasoning = JSON.parse(post.reasoningJson);
      } catch {
        // Malformed stored JSON — return null for this field; not an error (design spec)
        reasoning = null;
      }
    }

    postScreeningBlock = {
      transcriptFileName: post.transcriptFileName,
      aiRecommendation: post.aiRecommendation,
      recruiterChoice: post.recruiterChoice,
      isOverride: post.isOverride,
      reasoning,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  return {
    candidate: {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      position: candidate.position,
      notes: candidate.notes,
      cvFileName: candidate.cvFileName,
      linkedinFileName: candidate.linkedinFileName,
      status: candidate.status,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    },
    preScreening: preScreeningBlock,
    postScreening: postScreeningBlock,
  };
}

/**
 * Resolve the absolute disk path for a candidate's uploaded file.
 * Returns null if the candidate doesn't have the requested file.
 */
export async function getCandidateFilePath(
  id: string,
  type: "cv" | "linkedin"
): Promise<{ filePath: string; fileName: string } | null> {
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) return null;

  const fileName =
    type === "cv" ? candidate.cvFileName : candidate.linkedinFileName;
  if (!fileName) return null;

  const dir = type === "cv" ? "uploads/cv" : "uploads/linkedin";
  const filePath = path.resolve(dir, fileName);
  return { filePath, fileName };
}
