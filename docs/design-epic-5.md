# Design — Epic 5: Polish + Export

**Epic:** 5
**Phase:** 1.0-complete
**F-IDs in scope:** F-12, NF-07
**Date:** 2026-05-10

---

## What already exists (do not re-design)

From prior epics the following are complete and must not be touched by Epic 5 Developer agents unless fixing a `[HIGH]` or `[MEDIUM]` prior issue:

- Full candidate CRUD: `POST /candidates`, `GET /candidates`, `GET /candidates/:id`, `PUT /candidates/:id`, `DELETE /candidates/:id`, `GET /candidates/:id/files/:type`
- Pre-screening: `POST /candidates/:id/pre-screen` → `screening.service.ts` → `claude-sonnet-4-6`
- Post-screening: `POST /candidates/:id/post-screen`, `POST /candidates/:id/decision` → `postScreening.service.ts`
- All DB models: `Recruiter`, `Candidate`, `PreScreening`, `PostScreening` — no new migration needed in Epic 5
- Auth middleware, JWT, login page, ProtectedRoute, Navbar
- `apps/backend/src/lib/logger.ts` — currently a console-delegate stub; Epic 5 replaces it with a real structured logger
- FE components: `DashboardPage`, `CandidateDetailPage`, `PreScreeningTab`, `PostScreeningTab`, `CandidateDetailsCard`, `CandidateStatusBadge`

**Known issue to fix before new feature code (from Epic 4 TechLead):**

- `[EPIC-4][LOW]` BE: `postScreening.service.ts` and `screening.service.ts` do not use Anthropic prompt caching (`cache_control`) on the static system prompt. Address in Epic 5: add `cache_control: { type: "ephemeral" }` to the `system` block in both service files. This is a performance optimization and does not change behavior.

---

## § API Contract

### New endpoint — F-12

```
GET /candidates/:id/report
Auth required: yes
Request body: none
Response 200: {
  candidate: {
    id: string,
    name: string,
    email: string | null,
    position: string | null,
    notes: string | null,
    cvFileName: string | null,
    linkedinFileName: string | null,
    status: "pending" | "pre_screened" | "decided",
    createdAt: string,   // ISO 8601
    updatedAt: string    // ISO 8601
  },
  preScreening: {
    profileSummary: string | null,
    redFlags: Array<{
      claim: string,
      source: "cv" | "linkedin" | "gap",
      severity: "high" | "medium" | "low",
      validationQuestion: string
    }>,
    interviewQuestions: Array<{
      question: string,
      rationale: string,
      type: "verification" | "role-fit"
    }>,
    overallFit: number | null,   // integer 1–5 or null if not yet run
    createdAt: string | null,
    updatedAt: string | null
  } | null,
  postScreening: {
    transcriptFileName: string | null,
    aiRecommendation: "pass" | "no_pass" | null,
    recruiterChoice: "pass" | "no_pass" | null,
    isOverride: boolean | null,
    reasoning: {
      reasoning: string,
      keyFindings: Array<{
        type: string,
        description: string,
        relatedQuestion: string
      }>,
      confidenceScore: number
    } | null,   // null if postScreening absent or reasoningJson not parseable
    createdAt: string | null,
    updatedAt: string | null
  } | null
}
Response 404: { error: "Candidate not found" }
Response 500: { error: string }
```

**Design notes:**

- The endpoint fetches the candidate via the existing `getCandidateById(id)` Prisma call (includes `preScreening` and `postScreening` relations).
- `redFlags` and `interviewQuestions` are obtained by JSON-parsing `preScreening.redFlagsJson` and `preScreening.interviewQuestionsJson` respectively. If parsing fails, return empty arrays for each and log a `warn`.
- `reasoning` is obtained by JSON-parsing `postScreening.reasoningJson`. If absent or unparseable, return `null` for the field.
- The response is pure JSON — no PDF generation required for F-12 MVP (PDF is listed as optional stretch goal in BRD).
- The endpoint does NOT stream or attach a file — it returns a JSON body. The frontend triggers a browser download by constructing a `Blob` and invoking `URL.createObjectURL`.
- The `Content-Disposition` header is NOT set on this endpoint — the download is client-driven.

**Route placement:** Add to `apps/backend/src/routes/candidates.ts`. Register before `GET /candidates/:id` to avoid route conflict (`:id` segment matches first).

**Controller:** Add `getReportHandler` to `apps/backend/src/controllers/candidates.controller.ts`.

**Service:** Add `getCandidateReport(id: string)` to `apps/backend/src/services/candidates.service.ts`. This function assembles the report shape from the Prisma result. Keeps the controller thin.

---

## § FE Component Tree

### Pages (no new pages — extend existing)

```
/ → DashboardPage (protected — unchanged from Epic 4)
/candidates/:id → CandidateDetailPage (protected — add Download Report button)
/login → LoginPage (public — unchanged)
```

### CandidateDetailPage — additive changes only

Add a "Download Report" button in the page header row, to the right of the candidate name. The button appears on all candidates regardless of screening status (it exports whatever data exists). On click it calls `GET /candidates/:id/report`, creates a `Blob` from the JSON response, and triggers a download named `candidate-<id>-report.json`.

Button spec:
- shadcn/ui `<Button variant="outline" size="sm">` containing a download icon (`lucide-react` `Download` icon, size 16) and the label `Download Report`
- Placed in the header `div` with `flex items-center gap-2` alongside existing elements
- Loading state: replace icon with `Loader2` (spinning); disable button while request is in-flight
- Error state: show a shadcn/ui `<Alert variant="destructive">` below the header with `error.message`; auto-dismiss after 5 seconds (use `setTimeout` + `useState` to clear)

API function to add to `apps/frontend/src/lib/api.ts`:

```typescript
export function downloadReport(candidateId: string) {
  return api.get(`/candidates/${candidateId}/report`)
}
```

Download trigger pattern (to be implemented in `CandidateDetailPage.tsx`):

```typescript
const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = `candidate-${candidateId}-report.json`
a.click()
URL.revokeObjectURL(url)
```

### State management

Local `useState` in `CandidateDetailPage` only. No new context or store required:
- `reportLoading: boolean` — true while the GET /report request is in-flight
- `reportError: string | null` — set on API failure; cleared after 5 seconds

---

## § Observability

### NF-07 — Structured logging (replace the logger stub)

**Current state:** `apps/backend/src/lib/logger.ts` is a console-delegate stub with a comment indicating Epic 5 will replace it.

**Replacement:** Replace the stub with a real `pino` logger. Do not introduce Winston — `pino` is the correct choice: lower overhead, JSON output by default, no configuration required for structured output.

**Implementation spec for `apps/backend/src/lib/logger.ts`:**

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  // In dev: pretty-print for readability; in prod: raw JSON for log aggregators
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
```

**Required packages:** `pino` + `pino-pretty` (devDependency).

**Callers must not change their call signatures.** The existing `logger.info(msg, meta?)`, `logger.warn(msg, meta?)`, `logger.error(msg, meta?)` pattern is compatible with `pino` — no existing call sites need updating. Pino's first positional can be an object (merge object) then a string, but since all existing call sites pass `(string, object?)`, the logger export must expose a compatible surface. Use a thin adapter if pino's native API shape differs:

```typescript
// Thin pino adapter preserving existing (msg, meta?) call sites
const _pino = pino({ ... });

export const logger = {
  info:  (msg: string, meta?: object) => _pino.info(meta ?? {}, msg),
  warn:  (msg: string, meta?: object) => _pino.warn(meta ?? {}, msg),
  error: (msg: string, meta?: object) => _pino.error(meta ?? {}, msg),
  debug: (msg: string, meta?: object) => _pino.debug(meta ?? {}, msg),
};
```

**Request-level logging middleware — add to `apps/backend/src/app.ts`:**

A new inline middleware added immediately after `app.use(express.json())` and before all route handlers. It logs every request on completion:

```
Fields logged per request:
- timestamp:    automatic (pino adds it)
- method:       req.method
- path:         req.path
- candidateId:  req.params.id (if present, else omitted)
- statusCode:   res.statusCode
- duration_ms:  Date.now() - startTime
- level:        "info" for 2xx/3xx, "warn" for 4xx, "error" for 5xx
```

Implementation pattern:

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration_ms = Date.now() - start;
    const meta = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration_ms,
      ...(req.params?.id ? { candidateId: req.params.id } : {}),
    };
    if (res.statusCode >= 500) logger.error("Request completed", meta);
    else if (res.statusCode >= 400) logger.warn("Request completed", meta);
    else logger.info("Request completed", meta);
  });
  next();
});
```

**Anthropic call logging — add to both service files:**

Both `apps/backend/src/services/screening.service.ts` and `apps/backend/src/services/postScreening.service.ts` must log Anthropic call timing. Add before and after each `client.messages.create()` call:

```typescript
const anthropicStart = Date.now();
// ... client.messages.create(...)
logger.info("Anthropic API call completed", {
  endpoint: "POST /candidates/:id/pre-screen",  // or post-screen
  candidateId,
  model: "claude-sonnet-4-6",
  duration_ms: Date.now() - anthropicStart,
});
```

**Prompt caching (fix [EPIC-4][LOW]):**

While adding Anthropic call logging to both service files, also add `cache_control: { type: "ephemeral" }` to the `system` block of each `client.messages.create()` call:

```typescript
// In screening.service.ts and postScreening.service.ts
system: [
  {
    type: "text",
    text: SYSTEM_PROMPT,   // existing constant
    cache_control: { type: "ephemeral" },
  }
],
```

This requires changing `system` from `string` to `Array<{ type: "text"; text: string; cache_control?: ... }>`. The Anthropic SDK v4 `MessageParam` supports this shape. No behavior change.

**Test-file impact:** Vitest tests that mock `client.messages.create` do not test the `system` block shape — they only assert on the user prompt content and mock the response. No test changes required for the caching addition. The request-logging middleware does not affect integration test responses. The logger replacement does not affect test assertions (tests do not assert on log output).

---

## § Known Issues to Fix (from prior epics)

Before writing any new feature code in Epic 5:

| Priority | Issue | Fix |
|----------|-------|-----|
| LOW | `[EPIC-4][LOW]` BE: No Anthropic prompt caching on static system prompts | Add `cache_control: { type: "ephemeral" }` to system blocks in `screening.service.ts` and `postScreening.service.ts` — covered in § Observability above |

No `[HIGH]` or `[MEDIUM]` issues remain from prior TechLead summaries.
