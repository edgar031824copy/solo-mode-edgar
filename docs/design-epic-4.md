# Design Epic 4 — Post-Screening

**Epic:** 4
**Name:** Post-Screening
**F-IDs in scope:** F-07, F-08, F-09, F-10, F-11
**Status:** 1.0-complete

---

## Overview

Epic 4 completes the post-screening flow. It wires the `PostScreening` model (schema already in DB from Epic 2's migration) to a new backend endpoint that accepts an interview transcript upload, calls `claude-sonnet-4-6` for a final recommendation, and returns a `Pass / No Pass` decision. The frontend replaces the `PostScreeningTab` stub with a fully interactive view: transcript upload, loading/error/results states, context-aware decision buttons (F-10), and a persisted decided state that survives page refresh.

**Delta this epic adds:**

- `POST /candidates/:id/post-screen` — accepts transcript file upload; calls Anthropic; upserts `PostScreening` record; advances `Candidate.status` to `decided`
- `POST /candidates/:id/decision` — records recruiter's confirm/override choice; persists `recruiterChoice` and `isOverride`; idempotent (re-submitting overwrites)
- `PostScreeningTab` component — full replacement of the Epic 2 stub; handles transcript upload, four render states, context-aware decision buttons, and the decided badge display
- Fix for `[EPIC-2][LOW]` (deferred file link issue) — `CandidateDetailsCard` file link href must be prefixed with `import.meta.env.VITE_API_URL` so links work in production behind CloudFront
- No new Prisma models. No new Prisma migration. All required DB fields already exist.

---

## § Known Issues to Fix First

BE and FE agents must resolve these before writing any Epic 4 feature code:

| Severity | Layer | Issue | Fix |
|----------|-------|-------|-----|
| [EPIC-2][LOW] | FE | `CandidateDetailsCard` file link `href` uses bare relative paths (`/candidates/:id/files/cv`) without `VITE_API_URL` prefix — links return 404 in production (Vite proxy covers dev only) | In `apps/frontend/src/components/CandidateDetailsCard.tsx`, change the href values to `${import.meta.env.VITE_API_URL}/candidates/${candidate.id}/files/cv` (and the equivalent for linkedin). Verify `VITE_API_URL` is set in `apps/frontend/.env` |

The `[EPIC-3][HIGH]` bugs (pdf-parse self-test + LinkedIn PDF path) were design-doc items already handled by the Epic 3 TechLead in `review-report-epic-3.md`; if either still exists in the codebase, fix it before writing new code.

---

## § Database Schema

No new models. No new migration.

The `PostScreening` model and `PostScreeningDecision` enum defined in Epic 2's migration (`20260509191355_epic_2_candidate_management`) already contain all fields needed for Epic 4:

```prisma
model PostScreening {
  id                   String                 @id @default(uuid())
  candidateId          String                 @unique
  candidate            Candidate              @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  transcriptFileName   String?               // uploaded interview transcript filename
  aiRecommendation     PostScreeningDecision?
  recruiterChoice      PostScreeningDecision?
  isOverride           Boolean?              // true = recruiter overrode AI; false = recruiter confirmed AI
  reasoningJson        String?               // Claude reasoning blob: JSON string

  createdAt            DateTime               @default(now())
  updatedAt            DateTime               @updatedAt

  @@map("post_screenings")
}

enum PostScreeningDecision {
  pass
  no_pass
}
```

**Status advancement:** `POST /candidates/:id/post-screen` sets `Candidate.status = decided` atomically in the same Prisma transaction as writing the `PostScreening` record.

**Decision persistence (F-10):** `recruiterChoice` and `isOverride` are written by `POST /candidates/:id/decision` to the existing `PostScreening` row. `GET /candidates/:id` already returns the `postScreening` relation — no extra query needed for page-refresh recovery.

**Transcript storage:** Transcript files stored under `uploads/transcript/` (disk storage, same multer pattern as cv/linkedin). Filename stored in `PostScreening.transcriptFileName`. The `uploads/transcript/` directory must be `mkdirSync`-created at startup in `app.ts` alongside the existing `uploads/cv/` and `uploads/linkedin/` directories.

---

## § API Contract

### POST /candidates/:id/post-screen

Triggers Anthropic post-screening analysis. Idempotent: calling again overwrites the existing `PostScreening` record. Clears any prior `recruiterChoice` and `isOverride` on re-run (a re-run generates a fresh AI recommendation; the recruiter must re-confirm).

```
POST /candidates/:id/post-screen
Auth required: yes
Content-Type: multipart/form-data
Request body (form fields):
  transcript  — file (required); text file (.txt) or audio-to-text output; max 10 MB
Response 200: {
  id: string,
  candidateId: string,
  transcriptFileName: string,
  aiRecommendation: "pass" | "no_pass",
  recruiterChoice: null,
  isOverride: null,
  reasoningJson: string,        // raw JSON string as stored; parse client-side
  createdAt: string,            // ISO 8601
  updatedAt: string             // ISO 8601
}
Response 400: { error: "Transcript file is required" }
Response 404: { error: "Candidate not found" }
Response 409: { error: "Pre-screening must be completed before post-screening" }
Response 502: { error: "Anthropic API error: <message>" }
Response 500: { error: "Internal server error" }
```

**Processing flow:**
1. Look up candidate by `id` — 404 if not found
2. If no transcript file in the multipart upload → 400
3. If `candidate.preScreening` is null → 409 (post-screening requires pre-screening data as context)
4. Read transcript file as UTF-8 text (it is always a text file — `.txt` or similar)
5. Fetch existing `preScreening` record to supply interview questions + red flags as context to Claude
6. Call `claude-sonnet-4-6` with the post-screening system prompt (see § Anthropic API Integration)
7. Parse response as JSON; validate shape (must have `recommendation`, `reasoning`, `keyFindings`)
8. Upsert `PostScreening` record (clear `recruiterChoice` + `isOverride` on re-run); update `Candidate.status = decided` — single Prisma `$transaction`
9. Return the `PostScreening` record

### POST /candidates/:id/decision

Records the recruiter's final decision (confirm or override). This endpoint is separate from `/post-screen` so the AI analysis and the human decision are cleanly decoupled and individually logged (F-11).

```
POST /candidates/:id/decision
Auth required: yes
Content-Type: application/json
Request body: {
  choice: "pass" | "no_pass"    // required
}
Response 200: {
  id: string,
  candidateId: string,
  transcriptFileName: string | null,
  aiRecommendation: "pass" | "no_pass",
  recruiterChoice: "pass" | "no_pass",
  isOverride: boolean,          // true if recruiterChoice !== aiRecommendation
  reasoningJson: string,
  createdAt: string,
  updatedAt: string
}
Response 400: { error: "choice must be 'pass' or 'no_pass'" }
Response 404: { error: "Candidate not found" }
Response 409: { error: "Post-screening must be completed before recording a decision" }
Response 500: { error: "Internal server error" }
```

**Processing flow:**
1. Look up candidate by `id` — 404 if not found
2. Validate `choice` is `"pass"` or `"no_pass"` — 400 otherwise
3. If `candidate.postScreening` is null → 409 (no AI recommendation to confirm or override)
4. Compute `isOverride = (choice !== candidate.postScreening.aiRecommendation)`
5. Update `PostScreening` record: `recruiterChoice = choice`, `isOverride`, `updatedAt`
6. Log the decision (F-11) — see § Decision Logging
7. Return the updated `PostScreening` record

### GET /candidates/:id (unchanged)

Already returns the `postScreening` relation. Epic 4 populates it. No route changes required.

The response shape when `postScreening` is populated:

```
GET /candidates/:id
Response 200: {
  id, name, email, position, notes, cvFileName, linkedinFileName,
  status,                            // "decided" after post-screen
  recruiterChoice,                   // top-level flatten from postScreening.recruiterChoice
  createdAt, updatedAt,
  preScreening: { ... } | null,
  postScreening: {
    id,
    transcriptFileName: string | null,
    aiRecommendation: "pass" | "no_pass" | null,
    recruiterChoice: "pass" | "no_pass" | null,
    isOverride: boolean | null,
    reasoningJson: string | null,
    createdAt, updatedAt
  } | null
}
```

`reasoningJson` is a raw JSON string. Parse client-side with `JSON.parse()`.

### GET /candidates (unchanged from Epic 2/3)

Already flattens `postScreening.recruiterChoice` to top-level `recruiterChoice`. No changes needed — `CandidateStatusBadge` already handles `"decided"` + `pass`/`no_pass` badge rendering per F-14.

---

## § Anthropic API Integration

### Which endpoint calls Claude

`POST /candidates/:id/post-screen` → post-screening recommendation

### Model

`claude-sonnet-4-6` — do not substitute.

### Input shape to Claude call

```typescript
{
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: POSTSCREENING_SYSTEM_PROMPT,   // constant, never interpolated
  messages: [
    {
      role: "user",
      content: buildPostScreeningUserPrompt(transcriptText, preScreeningContext, position)
    }
  ]
}
```

### System prompt (full — production quality)

```
You are an expert technical recruiter assistant evaluating a candidate's interview performance. You have access to the pre-screening analysis (red flags and interview questions that were generated from the candidate's CV and LinkedIn profile) and the interview transcript. Your task is to assess how well the candidate addressed the pre-screening concerns and how suitable they are for the role.

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
- no_pass: One or more high-severity red flags were left unaddressed, candidate demonstrated fundamental skill gaps, or gave clearly fabricated or evasive answers to verification questions.
```

### User-turn message builder

```typescript
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
      const formatted = flags
        .map((f: { severity: string; claim: string }, i: number) =>
          `${i + 1}. [${f.severity.toUpperCase()}] ${f.claim}`
        )
        .join("\n");
      redFlagsSection = `--- PRE-SCREENING RED FLAGS ---\n${formatted || "(None)"}`;
    } catch {
      // Leave default
    }
  }

  let questionsSection = "--- INTERVIEW QUESTIONS USED ---\n(None available)";
  if (preScreeningContext.interviewQuestionsJson) {
    try {
      const questions = JSON.parse(preScreeningContext.interviewQuestionsJson);
      const formatted = questions
        .map((q: { question: string; type: string }, i: number) =>
          `${i + 1}. [${q.type}] ${q.question}`
        )
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
```

### Expected output shape (parsed from Claude response)

```typescript
interface PostScreeningOutput {
  recommendation: "pass" | "no_pass";
  reasoning: string;
  keyFindings: Array<{
    type: "strength" | "concern" | "unaddressed_flag";
    description: string;
    relatedQuestion: string | null;
  }>;
  confidenceScore: 1 | 2 | 3 | 4 | 5;
}
```

### Storage mapping

| Claude output field | Prisma field | Stored as |
|---------------------|--------------|-----------|
| `recommendation` | `PostScreening.aiRecommendation` | enum string `"pass"` or `"no_pass"` |
| `reasoning` + `keyFindings` + `confidenceScore` | `PostScreening.reasoningJson` | `JSON.stringify({ reasoning, keyFindings, confidenceScore })` |

### Error handling for Claude response

If `JSON.parse()` of Claude's response throws, or if `recommendation` is missing or not `"pass"`/`"no_pass"`, respond with `502 { error: "Anthropic API error: invalid response shape" }`. Do not persist a partial record.

Use the same `stripJsonFences()` helper already defined in `screening.service.ts` — export it from that file so `postScreening.service.ts` can import it, or duplicate the small function.

---

## § Decision Logging (F-11)

All decisions must be logged for audit. Use the existing `apps/backend/src/lib/logger.ts` (Winston or pino — whichever is already in use). Log both the AI recommendation and the recruiter's choice at the point each is recorded.

**When AI recommendation is written** (inside `runPostScreening()` after upsert succeeds):

```
[POST-SCREEN] candidateId=<id> aiRecommendation=<pass|no_pass> confidenceScore=<N>
```

**When recruiter decision is recorded** (inside `recordDecision()` after DB update succeeds):

```
[DECISION] candidateId=<id> recruiterChoice=<pass|no_pass> aiRecommendation=<pass|no_pass> isOverride=<true|false>
```

These log lines satisfy F-11. No separate `DecisionLog` DB table is required — the `PostScreening` record itself persists both the AI recommendation and the recruiter choice, and the logs provide the audit trail.

---

## § BE Folder Structure

No new route files. All changes are additive to existing files.

```
apps/backend/src/
├── controllers/
│   └── candidates.controller.ts   ← ADD: postScreenCandidateHandler, recordDecisionHandler
├── routes/
│   └── candidates.ts              ← ADD: POST /candidates/:id/post-screen, POST /candidates/:id/decision
├── services/
│   ├── candidates.service.ts      ← unchanged (upsertPostScreening logic goes in postScreening.service.ts)
│   ├── fileParser.service.ts      ← unchanged
│   ├── screening.service.ts       ← unchanged (runPreScreening stays here)
│   └── postScreening.service.ts   ← NEW: runPostScreening(candidateId, transcriptFileName), recordDecision(candidateId, choice)
├── middleware/
│   ├── auth.ts                    ← unchanged
│   └── upload.ts                  ← ADD: uploadTranscriptFile multer instance (transcript field, uploads/transcript/)
├── app.ts                         ← ADD: mkdirSync('uploads/transcript', { recursive: true }) at startup
└── lib/
    └── prisma.ts                  ← unchanged
```

**`postScreening.service.ts` exports:**

```typescript
export async function runPostScreening(
  candidateId: string,
  transcriptFile: Express.Multer.File
): Promise<PostScreening>

export async function recordDecision(
  candidateId: string,
  choice: "pass" | "no_pass"
): Promise<PostScreening>
```

**`upload.ts` addition:**

Add a new multer instance alongside the existing `uploadCandidateFiles`:

```typescript
export const uploadTranscriptFile = multer({
  storage: transcriptStorage,      // diskStorage to uploads/transcript/
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept text files only (.txt, .md, or plain text MIME types)
    const allowed = ["text/plain", "text/markdown", "application/octet-stream"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".txt"));
  },
}).single("transcript");
```

---

## § FE Component Tree

### Routes (unchanged)

```
/login             → LoginPage (public)
/                  → DashboardPage (protected)
/candidates/:id    → CandidateDetailPage (protected)
```

### CandidateDetailPage (unchanged structure)

```
CandidateDetailPage
├── CandidateDetailsCard          ← fix file link href prefix (EPIC-2-LOW)
└── shadcn <Tabs>
    ├── Pre-Screening <TabsTrigger>
    │   └── PreScreeningTab       ← unchanged from Epic 3
    └── Post-Screening <TabsTrigger>
        └── PostScreeningTab      ← FULLY REPLACED — see below
```

`CandidateDetailPage` passes an `onRefresh` callback into `PostScreeningTab` (same pattern as `PreScreeningTab`). The callback is the existing `fetchCandidate()` function already defined in `CandidateDetailPage.tsx`.

### PostScreeningTab — full spec

**File:** `apps/frontend/src/components/PostScreeningTab.tsx`

This component is a complete rewrite of the Epic 2/3 stub.

**Props interface:**

```typescript
interface Props {
  candidate: CandidateDetail;
  onRefresh: () => void;
}
```

**Local state shape:**

```typescript
type PostScreeningState = "idle" | "uploading" | "error" | "done";
const [screeningState, setScreeningState] = useState<PostScreeningState>(
  candidate.postScreening?.aiRecommendation ? "done" : "idle"
);
const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
const [error, setError] = useState<string | null>(null);
```

State derived from `candidate.postScreening` (from parent's `GET /candidates/:id`) — no extra API call needed for page-refresh recovery.

#### State 1 — Idle (no post-screening data)

```
┌────────────────────────────────────────────────────────────────┐
│  No post-screening data yet.                                   │
│                                                                │
│  Upload Interview Transcript                                   │
│  [FileDropZone — transcript field; .txt files only]            │
│                                                                │
│  [Run Post-Screening]  ← Button disabled until file selected  │
└────────────────────────────────────────────────────────────────┘
```

- Reuse the existing `<FileDropZone>` component (from Epic 2) with `accept=".txt,text/plain"` and `label="Interview Transcript"`
- "Run Post-Screening" button is disabled while `transcriptFile` is null
- On click: POST `multipart/form-data` to `POST /candidates/:id/post-screen` using the shared `api` instance (set `Content-Type: multipart/form-data` via `FormData`)
- While in-flight: transition to State 2

#### State 2 — Uploading / Analyzing (API call in-flight)

```
┌────────────────────────────────────────────────────────────────┐
│  [Loader2 spinner] Analyzing interview transcript...           │
│                                                                │
│  [Run Post-Screening]  ← Button disabled + spinner            │
└────────────────────────────────────────────────────────────────┘
```

- Same shadcn `<Button disabled>` + `<Loader2 className="mr-2 h-4 w-4 animate-spin" />` pattern as `PreScreeningTab`

#### State 3 — Error

```
┌────────────────────────────────────────────────────────────────┐
│  [Alert destructive]                                           │
│  Post-screening failed. <error message from API>               │
│                                                                │
│  [FileDropZone — re-uploadable]                                │
│  [Run Post-Screening]  ← re-enabled for retry                 │
└────────────────────────────────────────────────────────────────┘
```

#### State 4 — Results (aiRecommendation present; recruiterChoice absent)

This is the "AI has recommended, recruiter has not yet decided" state.

```
┌────────────────────────────────────────────────────────────────┐
│  AI Recommendation                                             │
│  ──────────────────────────────────────────────────────────── │
│  [PASS badge (green) | NO PASS badge (red)]                   │
│  Confidence: ★★★☆☆  (confidenceScore/5)                       │
│                                                                │
│  Reasoning                                                     │
│  ──────────────────────────────────────────────────────────── │
│  <reasoning text paragraph>                                    │
│                                                                │
│  Key Findings  (<count>)                                       │
│  ──────────────────────────────────────────────────────────── │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ [strength | concern | unaddressed_flag badge]          │   │
│  │ <description>                                          │   │
│  │ Related: <relatedQuestion> (or omit if null)           │   │
│  └────────────────────────────────────────────────────────┘   │
│  (repeated per finding)                                        │
│                                                                │
│  Your Decision                                                 │
│  ──────────────────────────────────────────────────────────── │
│  [Context-aware buttons — see F-10 spec below]                │
│                                                                │
│  [Re-run Post-Screening]  ← small outline button              │
└────────────────────────────────────────────────────────────────┘
```

**JSON parsing:** `reasoningJson` arrives as a raw JSON string. Parse client-side:

```typescript
const parsed = JSON.parse(candidate.postScreening.reasoningJson);
// shape: { reasoning: string, keyFindings: Array<...>, confidenceScore: number }
```

Guard with try/catch; if parsing fails, show a destructive Alert.

**Key Findings badge colors:**
- `strength` → `variant="default"` (blue/primary)
- `concern` → yellow `className="bg-yellow-100 text-yellow-800"`
- `unaddressed_flag` → `variant="destructive"` (red)

**AI Recommendation badge:**
- `pass` → `className="bg-green-100 text-green-800"` with text "PASS"
- `no_pass` → `className="bg-red-100 text-red-800"` with text "NO PASS"

#### F-10 — Context-aware decision buttons (State 4, undecided)

When `aiRecommendation` is set and `recruiterChoice` is null, render two buttons:

```
When aiRecommendation === "pass":
  [Confirm Pass]       ← primary Button variant="default"; calls POST /decision with choice="pass"
  [Override: No Pass]  ← Button variant="outline"; calls POST /decision with choice="no_pass"

When aiRecommendation === "no_pass":
  [Confirm No Pass]    ← primary Button variant="default"; calls POST /decision with choice="no_pass"
  [Override: Pass]     ← Button variant="outline"; calls POST /decision with choice="pass"
```

Both buttons are disabled while the decision API call is in-flight (use a `isSubmittingDecision` boolean state). On success: call `onRefresh()` to re-fetch the candidate — this transitions the component to State 5.

#### State 5 — Decided (recruiterChoice present)

When `recruiterChoice` is set, replace the decision buttons entirely with a decided badge block:

```
┌────────────────────────────────────────────────────────────────┐
│  [same AI Recommendation, Reasoning, Key Findings as State 4]  │
│                                                                │
│  Recruiter Decision                                            │
│  ──────────────────────────────────────────────────────────── │
│  [PASS badge (green) | NO PASS badge (red)]                   │
│  "Confirmed by recruiter"  ← when isOverride === false         │
│  "Overridden by recruiter" ← when isOverride === true          │
│                                                                │
│  [Re-run Post-Screening]  ← small outline button              │
└────────────────────────────────────────────────────────────────┘
```

This state loads correctly on page refresh because `recruiterChoice` and `isOverride` are persisted in `PostScreening` and returned by `GET /candidates/:id`.

**Decision badge and label logic:**

```typescript
const isDecided = !!candidate.postScreening?.recruiterChoice;
const confirmedOrOverridden =
  candidate.postScreening?.isOverride
    ? "Overridden by recruiter"
    : "Confirmed by recruiter";
```

#### Re-run button behavior

The "Re-run Post-Screening" button (small `<Button variant="outline" size="sm">`) is visible in both State 4 and State 5. Clicking it resets `screeningState` to `"idle"` and clears `transcriptFile`, allowing the recruiter to upload a new transcript and re-run. On a successful re-run `POST /candidates/:id/post-screen` clears `recruiterChoice` and `isOverride` in the DB (the service sets them to null), so the component transitions back to State 4.

---

## § Types Update (types.ts)

No type changes required. `CandidateDetail.postScreening` already includes `aiRecommendation`, `recruiterChoice`, `isOverride`, `reasoningJson`, and `transcriptFileName` — all fields Epic 4 populates are already typed.

---

## § Test Strategy

### BE unit tests (Vitest)

**File:** `apps/backend/src/tests/postScreening.test.ts` (new file)

| Test | Description |
|------|-------------|
| `POST /candidates/:id/post-screen 404` | Returns 404 when candidateId does not exist |
| `POST /candidates/:id/post-screen 400` | Returns 400 when no transcript file in the upload |
| `POST /candidates/:id/post-screen 409` | Returns 409 when candidate has no preScreening record |
| `POST /candidates/:id/post-screen 200` | Mocks Anthropic; validates response shape; aiRecommendation populated; recruiterChoice null |
| `POST /candidates/:id/post-screen upsert` | Re-running clears recruiterChoice + isOverride; overwrites aiRecommendation |
| `POST /candidates/:id/post-screen 502` | Anthropic returns malformed JSON → 502; no PostScreening record written |
| `POST /candidates/:id/decision 404` | Returns 404 when candidateId not found |
| `POST /candidates/:id/decision 409` | Returns 409 when postScreening does not exist |
| `POST /candidates/:id/decision 400` | Returns 400 when choice is invalid |
| `POST /candidates/:id/decision confirm` | choice matches aiRecommendation → isOverride=false |
| `POST /candidates/:id/decision override` | choice differs from aiRecommendation → isOverride=true |
| `runPostScreening service unit` | Direct service call with mocked Anthropic; validates reasoningJson stored correctly |

Mock strategy: `vi.mock('@anthropic-ai/sdk')` returning a fixed valid JSON string. No live API calls.

### FE unit tests (Vitest)

**File:** `apps/frontend/src/tests/PostScreeningTab.test.tsx` (new file)

| Test | Description |
|------|-------------|
| Renders idle state | "No post-screening data yet." visible; "Run Post-Screening" button disabled until file selected |
| Enables button after file selected | FileDropZone sets transcriptFile → button becomes enabled |
| Renders uploading state | After click, button disabled with spinner; loading text visible |
| Renders error state | On API error, destructive Alert; button re-enabled |
| Renders results state — pass | With `postScreening` data (aiRecommendation=pass, recruiterChoice=null): AI recommendation badge "PASS" visible; "Confirm Pass" and "Override: No Pass" buttons visible |
| Renders results state — no_pass | With `postScreening` data (aiRecommendation=no_pass, recruiterChoice=null): "Confirm No Pass" and "Override: Pass" buttons visible |
| Renders decided state — confirmed | With `recruiterChoice=pass, isOverride=false`: decided badge visible; "Confirmed by recruiter" label visible; no decision buttons visible |
| Renders decided state — overridden | With `recruiterChoice=pass, isOverride=true`: "Overridden by recruiter" label visible |
| onRefresh called after decision | Clicking a decision button calls `onRefresh` prop after successful API response |

### E2E tests (Playwright)

**File:** `apps/frontend/e2e/post-screening.spec.ts` (new file)

| Test | Description |
|------|-------------|
| Run post-screening happy path | Log in → create candidate with CV → run pre-screening → navigate to Post-Screening tab → upload transcript → click "Run Post-Screening" → wait for AI recommendation → verify badge renders |
| Confirm decision | After AI recommendation, click "Confirm [Pass\|No Pass]" → decided badge renders with "Confirmed by recruiter" |
| Override decision | Click "Override" button → decided badge renders with "Overridden by recruiter" |
| Page refresh preserves decided state | After deciding, reload page → decided badge still visible with correct label |
| Dashboard status shows decided badge | Navigate to dashboard → candidate row shows decided badge with pass/no_pass color |

**E2E note:** Same skip guard as Epic 3:

```typescript
test.skip(!process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY not set");
```

---

## § Implementation Order for BE Agent

1. Fix `[EPIC-2][LOW]` in `apps/frontend/src/components/CandidateDetailsCard.tsx` (even though it is a FE fix — flag it)
2. Add `mkdirSync('uploads/transcript', { recursive: true })` to `app.ts`
3. Add `uploadTranscriptFile` multer instance to `middleware/upload.ts`
4. Write failing tests in `postScreening.test.ts`
5. Implement `postScreening.service.ts` — `runPostScreening()` and `recordDecision()`
6. Implement `postScreenCandidateHandler` and `recordDecisionHandler` in `candidates.controller.ts`
7. Register routes in `candidates.ts`: `POST /candidates/:id/post-screen` (with `uploadTranscriptFile` middleware) and `POST /candidates/:id/decision`
8. Run all tests — all must pass before handing off

## § Implementation Order for FE Agent

1. Fix `[EPIC-2][LOW]` in `CandidateDetailsCard.tsx` (file link href prefix)
2. Write failing unit tests in `PostScreeningTab.test.tsx`
3. Implement `PostScreeningTab.tsx` — all five states (idle, uploading, error, results/undecided, decided)
4. Update `CandidateDetailPage.tsx` to pass `onRefresh` callback into `PostScreeningTab`
5. Write E2E test in `post-screening.spec.ts`
6. Run unit tests — all must pass before handing off
