# Design Epic 3 — Pre-Screening

**Epic:** 3
**Name:** Pre-Screening
**F-IDs in scope:** F-03, F-04, F-05, F-06
**Status:** 1.0-complete

---

## Overview

Epic 3 wires the Anthropic API into the existing candidate management foundation built in Epic 2. It implements one new backend endpoint (`POST /candidates/:id/pre-screen`), extends `GET /candidates/:id` to expose structured pre-screening output, and replaces the `PreScreeningTab` stub in the frontend with a fully interactive view. No new Prisma models or migrations are required — the `PreScreening` model and all its fields were already defined in Epic 2's schema migration.

**Delta this epic adds:**
- `POST /candidates/:id/pre-screen` — reads uploaded CV and LinkedIn files, calls `claude-sonnet-4-6`, writes structured output to `PreScreening` table, advances candidate status to `pre_screened`
- `GET /candidates/:id` — already returns `preScreening` relation; no route change, but structured JSON fields are now populated
- `PreScreeningTab` component — replaces stub with real UI: "Run Pre-Screening" button, loading state, results display (profile summary, red flags, interview questions, overall fit)
- Fix for `[EPIC-2][MEDIUM]` known defect (401 interceptor excludes `/auth/login`)

---

## § Known Issues to Fix First

BE and FE agents must resolve this before writing any Epic 3 feature code:

| Severity | Layer | Issue | Fix |
|----------|-------|-------|-----|
| [EPIC-2][MEDIUM] | FE | `api.ts` 401 interceptor redirects to `/login` on ANY 401, including `POST /auth/login` with wrong credentials — the error alert on the login page never renders | In `apps/frontend/src/lib/api.ts`, add a path exclusion in the response interceptor: if `error.config?.url` ends with `/auth/login`, do NOT redirect — let the error propagate so the login form can display it |

The [EPIC-2][LOW] file link issue (no `VITE_API_URL` prefix) is deferred to Epic 6 per the TechLead's note.

---

## § Database Schema

No new Prisma models. No new migration. The `PreScreening` model defined in Epic 2's migration (`20260509191355_epic_2_candidate_management`) already contains all fields needed:

```prisma
model PreScreening {
  id                     String    @id @default(uuid())
  candidateId            String    @unique
  candidate              Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  profileSummary         String?   // 2–3 sentence summary from Claude
  redFlagsJson           String?   // JSON: Array<{ claim, source, severity, validationQuestion }>
  interviewQuestionsJson String?   // JSON: Array<{ question, rationale, type }>
  overallFit             Int?      // 1–5 integer

  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  @@map("pre_screenings")
}
```

The `Candidate.position` field (`String?`, table: `candidates`) serves as the target position. If `position` is null when `POST /candidates/:id/pre-screen` is called, the backend must still proceed — the Claude prompt treats it as "unspecified role" and skips gap-based red flag generation.

**Status advancement:** `POST /candidates/:id/pre-screen` sets `Candidate.status = pre_screened` atomically in the same Prisma transaction as writing the `PreScreening` record.

---

## § API Contract

### POST /candidates/:id/pre-screen

Triggers Anthropic API analysis for the candidate. Idempotent: calling it again on a candidate that already has a `PreScreening` record overwrites it (upsert).

```
POST /candidates/:id/pre-screen
Auth required: yes
Request body: {} (empty — no body needed; files are already stored on disk)
Response 200: {
  id: string,
  candidateId: string,
  profileSummary: string,
  redFlagsJson: string,        // raw JSON string as stored
  interviewQuestionsJson: string, // raw JSON string as stored
  overallFit: number,          // 1–5
  createdAt: string,           // ISO 8601
  updatedAt: string            // ISO 8601
}
Response 400: { error: "No CV file found for this candidate" }
Response 404: { error: "Candidate not found" }
Response 502: { error: "Anthropic API error: <message>" }
Response 500: { error: "Internal server error" }
```

**Processing flow:**
1. Look up candidate by `id`; 404 if not found
2. If `cvFileName` is null and `linkedinFileName` is null → 400 (nothing to analyze)
3. If `cvFileName` is set, resolve path `uploads/cv/<cvFileName>` and call `parsePdf()` (returns `""` on error)
4. If `linkedinFileName` is set, resolve path `uploads/linkedin/<linkedinFileName>` and read as UTF-8 text (returns `""` on error — LinkedIn export may be `.txt`)
5. Build Claude prompt (see § Anthropic API Integration)
6. Call `claude-sonnet-4-6` with `max_tokens: 2048`
7. Parse response as JSON; validate shape (must have `profileSummary`, `redFlags`, `interviewQuestions`, `overallFit`)
8. Upsert `PreScreening` record; update `Candidate.status = pre_screened` — single Prisma transaction
9. Return the `PreScreening` record

### GET /candidates/:id

Unchanged from Epic 2 contract. Pre-screening result is already included in the response via the `preScreening` relation:

```
GET /candidates/:id
Auth required: yes
Response 200: {
  id, name, email, position, notes, cvFileName, linkedinFileName,
  status, createdAt, updatedAt,
  recruiterChoice: "pass" | "no_pass" | null,
  preScreening: {
    id, profileSummary, redFlagsJson, interviewQuestionsJson,
    overallFit, createdAt, updatedAt
  } | null,
  postScreening: { ... } | null
}
```

`redFlagsJson` and `interviewQuestionsJson` are raw JSON strings. The frontend is responsible for parsing them with `JSON.parse()` before rendering.

---

## § Anthropic API Integration

### Which endpoint calls Claude

`POST /candidates/:id/pre-screen` → pre-screening analysis

### Model

`claude-sonnet-4-6` — do not substitute.

### Input shape to Claude call

```typescript
{
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: PRESCREENING_SYSTEM_PROMPT,  // see below — constant, never interpolated
  messages: [
    {
      role: "user",
      content: buildUserPrompt(cvText, linkedinText, position)
    }
  ]
}
```

The system prompt is a fixed constant. Candidate-specific data (CV text, LinkedIn text, position) is injected only into the user-turn message — never into the system prompt.

### System prompt (full — production quality)

```
You are an expert technical recruiter assistant. Your task is to analyze a candidate's profile — consisting of their CV and LinkedIn export — and produce a structured evaluation in valid JSON.

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
- low: minor inconsistency, stylistic issue, or information that would be good to clarify but is not disqualifying
```

### User-turn message builder

```typescript
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
```

### Expected output shape (parsed from Claude response)

```typescript
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
  overallFit: 1 | 2 | 3 | 4 | 5;
}
```

### Storage mapping

| Claude output field | Prisma field | Stored as |
|---------------------|--------------|-----------|
| `profileSummary` | `PreScreening.profileSummary` | plain string |
| `redFlags` | `PreScreening.redFlagsJson` | `JSON.stringify(redFlags)` |
| `interviewQuestions` | `PreScreening.interviewQuestionsJson` | `JSON.stringify(interviewQuestions)` |
| `overallFit` | `PreScreening.overallFit` | integer |

### Error handling for Claude response

If `JSON.parse()` of Claude's response throws, or if required fields are missing/wrong type, respond with `502 { error: "Anthropic API error: invalid response shape" }`. Do not persist a partial record.

---

## § BE Folder Structure

No new files are needed beyond the existing structure. Changes are additive:

```
apps/backend/src/
├── controllers/
│   └── candidates.controller.ts   ← ADD: preScreenCandidateHandler
├── routes/
│   └── candidates.ts              ← ADD: POST /candidates/:id/pre-screen route
├── services/
│   ├── candidates.service.ts      ← ADD: upsertPreScreening(), setPreScreened() helpers
│   ├── fileParser.service.ts      ← unchanged (parsePdf already works)
│   └── screening.service.ts       ← IMPLEMENT: runPreScreening(candidateId) — was stub
├── middleware/
│   └── auth.ts                    ← unchanged
└── lib/
    └── prisma.ts                  ← unchanged
```

`screening.service.ts` is currently a one-line comment stub. Epic 3 BE agent implements it to export `runPreScreening(candidateId: string): Promise<PreScreening>`.

### Environment variables

One new env var required:

```
ANTHROPIC_API_KEY   — already present from Epic 1 scaffold; no new addition to .env.example needed
```

---

## § FE Component Tree

### Routes (unchanged)

```
/login             → LoginPage (public)
/                  → DashboardPage (protected)
/candidates/:id    → CandidateDetailPage (protected)
```

### CandidateDetailPage — tab layout (unchanged structure, PreScreeningTab content changes)

```
CandidateDetailPage
├── CandidateDetailsCard          ← unchanged
└── shadcn <Tabs>
    ├── Pre-Screening <TabsTrigger>
    │   └── PreScreeningTab       ← FULLY REPLACED — see below
    └── Post-Screening <TabsTrigger>
        └── PostScreeningTab      ← unchanged stub (Epic 4 fills in)
```

### PreScreeningTab — full spec

**File:** `apps/frontend/src/components/PreScreeningTab.tsx`

This component is a complete rewrite of the Epic 2 stub. It must handle four render states:

#### State 1 — No pre-screening data, not loading

```
┌─────────────────────────────────────────────────────────────┐
│  No pre-screening data yet.                                 │
│                                                             │
│  [Run Pre-Screening]  ← shadcn <Button> variant="default"  │
└─────────────────────────────────────────────────────────────┘
```

- Button is enabled (not disabled as in Epic 2 stub)
- Button onClick calls `POST /candidates/:id/pre-screen` via the shared `api` instance
- While the API call is in-flight, transition to State 2

#### State 2 — Loading (API call in-flight)

```
┌─────────────────────────────────────────────────────────────┐
│  [Loader2 spinner icon] Analyzing candidate...              │
│                                                             │
│  [Run Pre-Screening]  ← Button disabled, shows spinner      │
└─────────────────────────────────────────────────────────────┘
```

- Use shadcn `<Button disabled>` with a `<Loader2 className="mr-2 h-4 w-4 animate-spin" />` inside
- Full tab area shows a centered loading message: "Analyzing candidate..." in `text-muted-foreground`

#### State 3 — Error

```
┌─────────────────────────────────────────────────────────────┐
│  [Alert destructive]                                        │
│  Pre-screening failed. <error message from API>             │
│                                                             │
│  [Run Pre-Screening]  ← Button re-enabled for retry        │
└─────────────────────────────────────────────────────────────┘
```

- Use shadcn `<Alert variant="destructive">` with `<AlertDescription>`
- Button is re-enabled so the recruiter can retry

#### State 4 — Results (preScreening data present)

Layout: vertical stack, full width, `flex flex-col gap-6 py-4`

```
┌─────────────────────────────────────────────────────────────┐
│  Profile Summary                          Overall Fit: ★★★☆☆ │
│  ─────────────────────────────────────────────────────────  │
│  <profileSummary text>                                       │
├─────────────────────────────────────────────────────────────┤
│  Red Flags  (<count>)                                        │
│  ─────────────────────────────────────────────────────────  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [severity badge]  <claim text>                       │   │
│  │ Source: cv/linkedin/gap                              │   │
│  │ Validation: <validationQuestion>                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  (repeated per red flag; or "No red flags identified." if    │
│   redFlags array is empty)                                   │
├─────────────────────────────────────────────────────────────┤
│  Interview Questions  (5)                                    │
│  ─────────────────────────────────────────────────────────  │
│  1. <question text>  [verification badge]                    │
│     Rationale: <rationale>                                   │
│  2. ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

**Component details:**

- **Profile Summary card:** shadcn `<Card>` with `<CardHeader>` containing `<CardTitle>Profile Summary</CardTitle>` and an overall fit display (right-aligned): render `overallFit` as filled/empty star characters or a plain numeric badge — use `overallFit/5` format with a shadcn `<Badge>` (e.g., `"4 / 5"`) for simplicity
- **Red Flags section:** shadcn `<Card>` per red flag; severity badge colors: `high` → `variant="destructive"`, `medium` → yellow (use `className="bg-yellow-100 text-yellow-800"`), `low` → `variant="outline"`
- **Interview Questions section:** shadcn `<Card>` containing an ordered list (`<ol>`); each question shows the question text, a badge for `type` (`verification` → `variant="secondary"`, `role-fit` → `variant="default"`), and the rationale in `text-sm text-muted-foreground`
- **Re-run button:** below the results, a small `<Button variant="outline" size="sm">Re-run Pre-Screening</Button>` — calls the same handler, overwrites results on success

**JSON parsing:** `redFlagsJson` and `interviewQuestionsJson` come from the API as raw JSON strings. Parse them inside the component or in a helper. Guard with try/catch; if parsing fails, show destructive Alert.

**State management:** local React state (`useState`) — no global store. State shape:

```typescript
type ScreeningState = "idle" | "loading" | "error" | "done";
const [screeningState, setScreeningState] = useState<ScreeningState>(
  candidate.preScreening ? "done" : "idle"
);
const [error, setError] = useState<string | null>(null);
// parsed result is derived from candidate.preScreening prop + local override after run
```

After a successful run, the component must refresh the parent's `candidate` data so `CandidateDetailsCard` and the status badge reflect `pre_screened`. The prop is owned by `CandidateDetailPage` — pass an `onRefresh: () => void` callback prop into `PreScreeningTab` that triggers a re-fetch of `GET /candidates/:id`.

**Props interface:**

```typescript
interface Props {
  candidate: CandidateDetail;
  onRefresh: () => void;
}
```

### types.ts — no changes needed

The existing `CandidateDetail` type already includes `preScreening` with all required fields. No type changes.

---

## § Test Strategy

### BE unit tests (Vitest)

File: `apps/backend/src/tests/screening.test.ts`

| Test | Description |
|------|-------------|
| `POST /candidates/:id/pre-screen 404` | Returns 404 when candidateId does not exist |
| `POST /candidates/:id/pre-screen 400` | Returns 400 when candidate has no CV and no LinkedIn file |
| `POST /candidates/:id/pre-screen 200` | Mocks Anthropic client; validates response shape matches PreScreening record |
| `POST /candidates/:id/pre-screen upsert` | Calling endpoint twice overwrites the existing PreScreening; candidate status = pre_screened |
| `POST /candidates/:id/pre-screen 502` | Anthropic returns malformed JSON → 502 response; no PreScreening record written |
| `runPreScreening service unit` | Direct service call with mocked Anthropic client; validates JSON stored correctly |

Mock strategy: use `vi.mock('@anthropic-ai/sdk')` to return a fixed valid JSON string. Do not make live API calls in tests.

### FE unit tests (Vitest)

File: `apps/frontend/src/tests/PreScreeningTab.test.tsx`

| Test | Description |
|------|-------------|
| Renders idle state | "No pre-screening data yet." visible; button enabled |
| Renders loading state | After click, button disabled with spinner; loading text visible |
| Renders error state | On API error, destructive Alert with message; button re-enabled |
| Renders results state | With `preScreening` data, profile summary, red flags, and 5 questions render |
| Re-run button | Present in results state; clicking it triggers another API call |
| onRefresh called | After successful pre-screen run, `onRefresh` prop is invoked |

### E2E tests (Playwright)

File: `apps/frontend/e2e/pre-screening.spec.ts`

| Test | Description |
|------|-------------|
| Run pre-screening happy path | Log in → create candidate with CV → navigate to detail → click "Run Pre-Screening" → wait for results → verify profile summary renders, 5 questions visible, no error |
| Status badge advances | After pre-screening, candidate status badge on detail page shows `pre_screened` |
| Dashboard status updates | Navigate back to dashboard → candidate row shows `pre_screened` badge |

**E2E note:** The E2E tests require `ANTHROPIC_API_KEY` set in the test environment and make real API calls. If the key is absent, tests should skip with `test.skip`. Add a guard at the top of the spec:

```typescript
test.skip(!process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY not set");
```

---

## § Implementation Order for BE Agent

1. Fix `[EPIC-2][MEDIUM]` in `apps/frontend/src/lib/api.ts` first (even though it is a FE fix — note it as a cross-agent dependency)
2. Write failing tests in `screening.test.ts`
3. Implement `screening.service.ts` — `runPreScreening()` function
4. Implement `candidates.service.ts` additions — `upsertPreScreening()` helper
5. Add `preScreenCandidateHandler` to `candidates.controller.ts`
6. Register route in `candidates.ts` router: `router.post('/candidates/:id/pre-screen', preScreenCandidateHandler)`
7. Run tests — all must pass before handing off

## § Implementation Order for FE Agent

1. Fix `[EPIC-2][MEDIUM]` in `apps/frontend/src/lib/api.ts` (BE agent may also flag this — whoever runs first makes the fix)
2. Write failing unit tests in `PreScreeningTab.test.tsx`
3. Implement `PreScreeningTab.tsx` — all four states
4. Update `CandidateDetailPage.tsx` to pass `onRefresh` callback into `PreScreeningTab`
5. Write E2E test in `pre-screening.spec.ts`
6. Run unit tests — all must pass before handing off
