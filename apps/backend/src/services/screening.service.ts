import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { parsePdfBuffer } from "./fileParser.service.js";
import { getS3Buffer } from "./s3.service.js";
import { logger } from "../lib/logger.js";
import type { PreScreening } from "@prisma/client";

// ── System prompt (fixed constant — never interpolated) ───────────────────────

const PRESCREENING_SYSTEM_PROMPT = `You are an expert technical recruiter assistant. Your task is to analyze a candidate's profile — consisting of their CV and LinkedIn export — and produce a structured evaluation in valid JSON.

OUTPUT RULES:
- Respond with valid JSON only.
- Do not include markdown code fences, backticks, or any prose before or after the JSON.
- Do not add trailing commas.
- All string values must be properly escaped.

OUTPUT SHAPE (produce exactly this structure):
{
  "profileSummary": "<string: 2–3 sentences summarizing the candidate's background and explicitly referencing fit for the POSITION>",
  "redFlags": [
    {
      "claim": "<string: exact quote or close paraphrase from the profile>",
      "source": "<'cv' | 'linkedin' | 'gap'>",
      "severity": "<'high' | 'medium' | 'low'>",
      "validationQuestion": "<string: interview question to probe or verify this flag>"
    }
  ],
  "interviewQuestions": [
    {
      "question": "<string>",
      "rationale": "<string: which claim or gap in the profile this probes>",
      "type": "<'verification' | 'role-fit'>"
    }
  ],
  "overallFit": <integer 1–5>
}

FIELD RULES:
- profileSummary: Exactly 2–3 sentences. Must explicitly name the POSITION (or note it was unspecified) and make a direct statement about the candidate's fit.
- redFlags: Include all meaningful inconsistencies, gaps, or unverifiable claims. If POSITION is specified, include at least one entry with source "gap" for each key competency required by POSITION that is absent or unclear in the profile. If no red flags exist, return an empty array.
- interviewQuestions: Exactly 5 entries — exactly 3 with type "verification" (probing specific CV or LinkedIn claims) and exactly 2 with type "role-fit" (probing position requirements not directly evidenced in the profile). If POSITION is unspecified, make all role-fit questions general leadership and culture-fit probes.
- overallFit: An integer from 1 (very poor fit) to 5 (excellent fit) representing how well the candidate's profile matches the POSITION requirements. If POSITION is unspecified, base the score on general seniority and completeness of the profile.

SEVERITY GUIDE for redFlags:
- high: direct contradiction between CV and LinkedIn (dates, titles, employers), or a critical competency missing for the POSITION
- medium: vague or unverifiable claim, short unexplained tenure, missing quantification of impact
- low: minor inconsistency, stylistic issue, or information that would be good to clarify but is not disqualifying`;

// ── User-turn message builder ─────────────────────────────────────────────────

function buildUserPrompt(
  cvText: string,
  linkedinText: string,
  position: string | null
): string {
  const positionLine = position
    ? `TARGET POSITION: ${position}`
    : "TARGET POSITION: Not specified";

  const cvSection = cvText.trim()
    ? `--- CV ---\n${cvText.trim()}`
    : "--- CV ---\n(No CV text could be extracted)";

  const linkedinSection = linkedinText.trim()
    ? `--- LINKEDIN EXPORT ---\n${linkedinText.trim()}`
    : "--- LINKEDIN EXPORT ---\n(No LinkedIn export provided)";

  return `${positionLine}\n\n${cvSection}\n\n${linkedinSection}`;
}

// ── JSON fence stripper — Claude sometimes wraps output in ```json ... ``` ────

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

// ── Shape validation ──────────────────────────────────────────────────────────

interface PreScreeningOutput {
  profileSummary: string;
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
  overallFit: number;
}

function isValidPreScreeningOutput(obj: unknown): obj is PreScreeningOutput {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.profileSummary === "string" &&
    Array.isArray(o.redFlags) &&
    Array.isArray(o.interviewQuestions) &&
    typeof o.overallFit === "number"
  );
}

// ── Claude call with one silent retry on malformed JSON ───────────────────────

async function callClaudeWithRetry(
  client: Anthropic,
  userPrompt: string,
  candidateId?: string
): Promise<PreScreeningOutput> {
  async function attempt(): Promise<PreScreeningOutput> {
    const anthropicStart = Date.now();

    // system as array enables prompt caching on the static system prompt block ([EPIC-4][LOW] fix)
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: PRESCREENING_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    logger.info("Anthropic API call completed", {
      endpoint: "POST /candidates/:id/pre-screen",
      candidateId,
      model: "claude-sonnet-4-6",
      duration_ms: Date.now() - anthropicStart,
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = stripJsonFences(raw);
    const parsed = JSON.parse(cleaned);

    if (!isValidPreScreeningOutput(parsed)) {
      throw new Error("invalid response shape");
    }

    return parsed;
  }

  try {
    return await attempt();
  } catch {
    // One silent retry before surfacing the error
    return await attempt();
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runPreScreening(
  candidateId: string
): Promise<PreScreening> {
  // 1. Look up candidate — 404 if not found
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    const err = new Error("Candidate not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  // 2. Require at least one file — 400 if neither is set
  if (!candidate.cvFileName && !candidate.linkedinFileName) {
    const err = new Error(
      "No CV file found for this candidate"
    ) as Error & { status: number };
    err.status = 400;
    throw err;
  }

  // 3. Extract text from CV — read buffer from S3, then parse based on extension (F-24)
  let cvText = "";
  if (candidate.cvFileName) {
    const cvBuffer = await getS3Buffer(candidate.cvFileName);
    const ext = path.extname(candidate.cvFileName).toLowerCase();
    cvText =
      ext === ".pdf"
        ? await parsePdfBuffer(cvBuffer)
        : cvBuffer.toString("utf-8");
  }

  // 4. Extract text from LinkedIn export — same S3 buffer approach (F-24)
  let linkedinText = "";
  if (candidate.linkedinFileName) {
    const linkedinBuffer = await getS3Buffer(candidate.linkedinFileName);
    const linkedinExt = path.extname(candidate.linkedinFileName).toLowerCase();
    linkedinText =
      linkedinExt === ".pdf"
        ? await parsePdfBuffer(linkedinBuffer)
        : linkedinBuffer.toString("utf-8");
  }

  // 5. Call Claude with retry; throw 502 on parse/shape failure
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  let parsed: PreScreeningOutput;
  try {
    parsed = await callClaudeWithRetry(
      anthropic,
      buildUserPrompt(cvText, linkedinText, candidate.position ?? null),
      candidateId
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "unknown error";
    const apiErr = new Error(
      `Anthropic API error: ${message}`
    ) as Error & { status: number };
    apiErr.status = 502;
    throw apiErr;
  }

  // 6. Upsert PreScreening + advance Candidate.status atomically
  const [preScreening] = await prisma.$transaction([
    prisma.preScreening.upsert({
      where: { candidateId },
      create: {
        candidateId,
        profileSummary: parsed.profileSummary,
        redFlagsJson: JSON.stringify(parsed.redFlags),
        interviewQuestionsJson: JSON.stringify(parsed.interviewQuestions),
        overallFit: parsed.overallFit,
      },
      update: {
        profileSummary: parsed.profileSummary,
        redFlagsJson: JSON.stringify(parsed.redFlags),
        interviewQuestionsJson: JSON.stringify(parsed.interviewQuestions),
        overallFit: parsed.overallFit,
      },
    }),
    prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "pre_screened" },
    }),
  ]);

  return preScreening;
}
