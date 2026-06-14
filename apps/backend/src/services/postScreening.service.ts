import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import type { PostScreening } from "@prisma/client";

// ── System prompt (fixed constant — never interpolated) ───────────────────────

const POSTSCREENING_SYSTEM_PROMPT = `You are an expert technical recruiter assistant evaluating a candidate's interview performance. You have access to the pre-screening analysis (red flags and interview questions that were generated from the candidate's CV and LinkedIn profile) and the interview transcript. Your task is to assess how well the candidate addressed the pre-screening concerns and how suitable they are for the role.

OUTPUT RULES:
- Respond with valid JSON only.
- Do not include markdown code fences, backticks, or any prose before or after the JSON.
- Do not add trailing commas.
- All string values must be properly escaped.

OUTPUT SHAPE (produce exactly this structure):
{
  "recommendation": "<'pass' | 'no_pass'>",
  "reasoning": "<string: 3–5 sentences explaining the recommendation, referencing specific answers from the transcript and how they addressed or failed to address the pre-screening red flags>",
  "keyFindings": [
    {
      "type": "<'strength' | 'concern' | 'unaddressed_flag'>",
      "description": "<string: specific observation from the transcript>",
      "relatedQuestion": "<string | null: the interview question this finding relates to, or null if general>"
    }
  ],
  "confidenceScore": <integer 1–5>
}

FIELD RULES:
- recommendation: "pass" if the candidate demonstrated sufficient competency and addressed the key pre-screening concerns; "no_pass" if critical red flags were not addressed, the candidate showed significant skill gaps, or answers were evasive or unsatisfactory.
- reasoning: 3–5 sentences. Must reference at least one specific answer from the transcript and explicitly tie the recommendation to whether pre-screening red flags were addressed. Do not repeat the pre-screening summary — add new insight from the interview.
- keyFindings: An array of observations. Include at least one entry per pre-screening red flag — mark as "unaddressed_flag" if the flag was not addressed during the interview, "strength" if the candidate convincingly resolved it, or "concern" if the answer was weak or evasive. Add additional findings for notable strengths not flagged in pre-screening. Minimum 3 entries; no maximum.
- confidenceScore: Integer 1–5. Reflects how much evidence the transcript provides. 5 = transcript is detailed and answers all questions clearly. 1 = transcript is very short, incomplete, or off-topic.

RECOMMENDATION GUIDE:
- pass: Candidate clearly addressed most or all high-severity red flags, demonstrated required skills, and showed coherent reasoning. Minor gaps acceptable.
- no_pass: One or more high-severity red flags were left unaddressed, candidate demonstrated fundamental skill gaps, or gave clearly fabricated or evasive answers to verification questions.`;

// ── JSON fence stripper — Claude sometimes wraps output in \`\`\`json ... \`\`\` ────

function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

// ── Output shape validation ───────────────────────────────────────────────────

interface PostScreeningOutput {
  recommendation: "pass" | "no_pass";
  reasoning: string;
  keyFindings: Array<{
    type: "strength" | "concern" | "unaddressed_flag";
    description: string;
    relatedQuestion: string | null;
  }>;
  confidenceScore: number;
}

function isValidPostScreeningOutput(obj: unknown): obj is PostScreeningOutput {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    (o.recommendation === "pass" || o.recommendation === "no_pass") &&
    typeof o.reasoning === "string" &&
    Array.isArray(o.keyFindings) &&
    typeof o.confidenceScore === "number"
  );
}

// ── User-turn message builder ─────────────────────────────────────────────────

function buildPostScreeningUserPrompt(
  transcriptText: string,
  preScreeningContext: {
    profileSummary: string | null;
    redFlagsJson: string | null;
    interviewQuestionsJson: string | null;
    overallFit: number | null;
  },
  position: string | null
): string {
  const positionLine = position
    ? `TARGET POSITION: ${position}`
    : "TARGET POSITION: Not specified";

  const summarySection = preScreeningContext.profileSummary
    ? `--- PRE-SCREENING SUMMARY ---\n${preScreeningContext.profileSummary}`
    : "--- PRE-SCREENING SUMMARY ---\n(No summary available)";

  let redFlagsSection = "--- PRE-SCREENING RED FLAGS ---\n(None identified)";
  if (preScreeningContext.redFlagsJson) {
    try {
      const flags = JSON.parse(preScreeningContext.redFlagsJson);
      const formatted = (flags as Array<{ severity: string; claim: string }>)
        .map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.claim}`)
        .join("\n");
      redFlagsSection = `--- PRE-SCREENING RED FLAGS ---\n${formatted || "(None)"}`;
    } catch {
      // Leave default — malformed JSON in stored field should not break this call
    }
  }

  let questionsSection = "--- INTERVIEW QUESTIONS USED ---\n(None available)";
  if (preScreeningContext.interviewQuestionsJson) {
    try {
      const questions = JSON.parse(preScreeningContext.interviewQuestionsJson);
      const formatted = (questions as Array<{ question: string; type: string }>)
        .map((q, i) => `${i + 1}. [${q.type}] ${q.question}`)
        .join("\n");
      questionsSection = `--- INTERVIEW QUESTIONS USED ---\n${formatted}`;
    } catch {
      // Leave default
    }
  }

  const transcriptSection = transcriptText.trim()
    ? `--- INTERVIEW TRANSCRIPT ---\n${transcriptText.trim()}`
    : "--- INTERVIEW TRANSCRIPT ---\n(No transcript text provided)";

  return `${positionLine}\n\n${summarySection}\n\n${redFlagsSection}\n\n${questionsSection}\n\n${transcriptSection}`;
}

// ── Claude call with one silent retry on malformed JSON ───────────────────────

async function callClaudeWithRetry(
  client: Anthropic,
  userPrompt: string,
  candidateId?: string
): Promise<PostScreeningOutput> {
  async function attempt(): Promise<PostScreeningOutput> {
    const anthropicStart = Date.now();

    // system as array enables prompt caching on the static system prompt block ([EPIC-4][LOW] fix)
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: POSTSCREENING_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });

    logger.info("Anthropic API call completed", {
      endpoint: "POST /candidates/:id/post-screen",
      candidateId,
      model: "claude-sonnet-4-6",
      duration_ms: Date.now() - anthropicStart,
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const cleaned = stripJsonFences(raw);
    const parsed = JSON.parse(cleaned);

    if (!isValidPostScreeningOutput(parsed)) {
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

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Runs post-screening analysis for a candidate.
 * Reads the transcript file, calls claude-sonnet-4-6, upserts PostScreening.
 * On re-run: clears recruiterChoice + isOverride so recruiter must re-confirm.
 * Advances Candidate.status to "decided" atomically.
 */
export async function runPostScreening(
  candidateId: string,
  transcriptFile: Express.Multer.File
): Promise<PostScreening> {
  // 1. Look up candidate with relations — 404 if not found
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { preScreening: true },
  });

  if (!candidate) {
    const err = new Error("Candidate not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  // 2. Require pre-screening context — 409 if absent
  if (!candidate.preScreening) {
    const err = new Error(
      "Pre-screening must be completed before post-screening"
    ) as Error & { status: number };
    err.status = 409;
    throw err;
  }

  // 3. Read transcript file from disk
  const transcriptPath = path.resolve("uploads/transcript", transcriptFile.filename);
  const transcriptText = fs.readFileSync(transcriptPath, "utf-8");

  // 4. Call Claude with retry; throw 502 on parse/shape failure
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  let parsed: PostScreeningOutput;
  try {
    parsed = await callClaudeWithRetry(
      anthropic,
      buildPostScreeningUserPrompt(
        transcriptText,
        {
          profileSummary: candidate.preScreening.profileSummary,
          redFlagsJson: candidate.preScreening.redFlagsJson,
          interviewQuestionsJson: candidate.preScreening.interviewQuestionsJson,
          overallFit: candidate.preScreening.overallFit,
        },
        candidate.position ?? null
      ),
      candidateId
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    const apiErr = new Error(
      `Anthropic API error: ${message}`
    ) as Error & { status: number };
    apiErr.status = 502;
    throw apiErr;
  }

  // 5. Upsert PostScreening + advance Candidate.status atomically
  //    Re-run clears recruiterChoice + isOverride so recruiter must re-confirm after fresh analysis
  const reasoningJson = JSON.stringify({
    reasoning: parsed.reasoning,
    keyFindings: parsed.keyFindings,
    confidenceScore: parsed.confidenceScore,
  });

  const [postScreening] = await prisma.$transaction([
    prisma.postScreening.upsert({
      where: { candidateId },
      create: {
        candidateId,
        transcriptFileName: transcriptFile.originalname,
        aiRecommendation: parsed.recommendation,
        recruiterChoice: null,
        isOverride: null,
        reasoningJson,
      },
      update: {
        transcriptFileName: transcriptFile.originalname,
        aiRecommendation: parsed.recommendation,
        // Re-run must clear prior decision so stale override state is not shown next to fresh analysis
        recruiterChoice: null,
        isOverride: null,
        reasoningJson,
      },
    }),
    prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "decided" },
    }),
  ]);

  // F-11 — log AI recommendation for audit trail
  logger.info(
    `[POST-SCREEN] candidateId=${candidateId} aiRecommendation=${parsed.recommendation} confidenceScore=${parsed.confidenceScore}`
  );

  return postScreening;
}

/**
 * Records recruiter's final decision (confirm or override).
 * Computes isOverride server-side: recruiterChoice !== aiRecommendation.
 * Idempotent: re-submitting overwrites.
 */
export async function recordDecision(
  candidateId: string,
  choice: "pass" | "no_pass"
): Promise<PostScreening> {
  // 1. Look up candidate with postScreening relation — 404 if not found
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { postScreening: true },
  });

  if (!candidate) {
    const err = new Error("Candidate not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  // 2. Require post-screening to have been run — 409 if absent
  if (!candidate.postScreening) {
    const err = new Error(
      "Post-screening must be completed before recording a decision"
    ) as Error & { status: number };
    err.status = 409;
    throw err;
  }

  // 3. Compute isOverride server-side so client cannot forge it
  const isOverride = choice !== candidate.postScreening.aiRecommendation;

  // 4. Update PostScreening with recruiter's choice
  const updated = await prisma.postScreening.update({
    where: { candidateId },
    data: {
      recruiterChoice: choice,
      isOverride,
    },
  });

  // F-11 — log recruiter decision for audit trail
  logger.info(
    `[DECISION] candidateId=${candidateId} recruiterChoice=${choice} aiRecommendation=${candidate.postScreening.aiRecommendation} isOverride=${isOverride}`
  );

  return updated;
}
