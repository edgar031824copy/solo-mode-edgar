# Design Epic 11 — F-29: Async Pre/Post-Screening

> Amendment F-29 only. All prior F-IDs are complete and must not be modified.
> BRD has no rows for Epic 11 — this epic is driven entirely by amendments.md.

---

## § DB Schema

### Additive change to `apps/backend/prisma/schema.prisma`

Add one optional field to the `Candidate` model:

```prisma
model Candidate {
  // ... all existing fields unchanged ...

  // F-29: stores error message if background pre-screening fails
  preScreeningError  String?

  // ... relations unchanged ...
}
```

The `PostScreening` model does not receive an error field. Post-screening failures
are surfaced via the same `preScreeningError` field on Candidate (it is the sole
async-error signal on the parent record). See the naming note in § API Contract.

**Migration:** Run `npx prisma migrate dev --name epic11_prescreening_error` from
`apps/backend/`. This produces a single `ALTER TABLE candidates ADD COLUMN
"preScreeningError" TEXT` migration. No data migration needed.

---

## § API Contract

### `POST /candidates/:id/pre-screen` — changed

```
METHOD  POST /candidates/:id/pre-screen
Auth required: yes

Request body: none

Response 202:
{
  "message": "Pre-screening started"
}

Response 404: { "error": "Candidate not found" }
Response 400: { "error": "No CV file found for this candidate" }
```

Behavior:
1. Validate the candidate exists (404 if not). Validate it has at least one file (400 if not).
2. Clear `preScreeningError` to `null` on the Candidate record (so a retry starts clean).
3. Respond 202 immediately — do NOT await the Claude call.
4. In a detached async callback (fire-and-forget), call `runPreScreening(candidateId)`:
   - On success: upsert PreScreening record + advance `Candidate.status` to
     `pre_screened` (same as before — no change to `runPreScreening` logic).
   - On failure: update `Candidate.preScreeningError` with the error message string.
     Do NOT throw. Log the error via `logger.error`.

### `POST /candidates/:id/post-screen` — changed

```
METHOD  POST /candidates/:id/post-screen
Auth required: yes

Request body: multipart/form-data
  transcript: File (required, text/plain)

Response 202:
{
  "message": "Post-screening started"
}

Response 400: { "error": "Transcript file is required" }
Response 404: { "error": "Candidate not found" }
```

Behavior:
1. Validate `req.file` (transcript) is present (400 if missing).
2. Validate the candidate exists (404 if not).
3. Clear `preScreeningError` to `null` (reuse the same error field as the async signal).
4. Respond 202 immediately.
5. In a detached async callback, call `runPostScreening(candidateId, transcriptFile)`:
   - On success: upsert PostScreening record + advance `Candidate.status` to
     `decided` (same as before).
   - On failure: update `Candidate.preScreeningError` with the error message.
     Log via `logger.error`.

**Note on shared error field:** Both pre- and post-screening failures write to
`Candidate.preScreeningError`. The FE interprets this field as a generic async-job
error regardless of which job last ran. The field is cleared at the start of each
new screening request.

### `GET /candidates/:id` — response shape updated

```
METHOD  GET /candidates/:id
Auth required: yes

Response 200: CandidateDetail (existing shape + new field)
{
  "id": "string",
  "name": "string",
  "email": "string | null",
  "position": "string | null",
  "notes": "string | null",
  "status": "pending" | "pre_screened" | "decided",
  "cvFileName": "string | null",
  "linkedinFileName": "string | null",
  "preScreeningError": "string | null",   // NEW — F-29
  "createdAt": "string",
  "updatedAt": "string",
  "recruiterChoice": "pass" | "no_pass" | null,
  "preScreening": { ... } | null,          // unchanged
  "postScreening": { ... } | null          // unchanged
}

Response 404: { "error": "Candidate not found" }
```

The `preScreeningError` field must be included in the Prisma `select`/`include` for
`getCandidateById`. It is already on the model after the migration — verify the
service returns it.

No other existing endpoints change.

---

## § BE Changes

### `apps/backend/src/controllers/candidates.controller.ts`

**`preScreenCandidateHandler`** — replace with async-202 pattern:

```typescript
export async function preScreenCandidateHandler(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  const { id } = req.params;

  // 1. Validate candidate exists and has files (synchronous checks before 202)
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  if (!candidate.cvFileName && !candidate.linkedinFileName) {
    res.status(400).json({ error: "No CV file found for this candidate" });
    return;
  }

  // 2. Clear any prior error so polling can detect a fresh failure
  await prisma.candidate.update({
    where: { id },
    data: { preScreeningError: null },
  });

  // 3. Respond 202 immediately
  res.status(202).json({ message: "Pre-screening started" });

  // 4. Fire-and-forget (intentionally not awaited)
  void runPreScreeningAsync(id);
}
```

Add a module-level helper (same file or extracted to service):

```typescript
async function runPreScreeningAsync(candidateId: string): Promise<void> {
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
```

**`postScreenCandidateHandler`** — replace with async-202 pattern:

```typescript
export async function postScreenCandidateHandler(
  req: Request<IdParams>,
  res: Response
): Promise<void> {
  const transcriptFile = req.file as Express.Multer.File | undefined;
  if (!transcriptFile) {
    res.status(400).json({ error: "Transcript file is required" });
    return;
  }

  const { id } = req.params;
  const candidate = await prisma.candidate.findUnique({ where: { id } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  // Clear any prior async error
  await prisma.candidate.update({
    where: { id },
    data: { preScreeningError: null },
  });

  // Respond 202 immediately
  res.status(202).json({ message: "Post-screening started" });

  // Fire-and-forget
  void runPostScreeningAsync(id, transcriptFile);
}
```

```typescript
async function runPostScreeningAsync(
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
```

Import `prisma` and `logger` at the top of `candidates.controller.ts` — both are
already used in the file; verify imports are present.

### `apps/backend/src/services/candidates.service.ts`

Ensure `getCandidateById` includes `preScreeningError` in its returned shape. Since
the field is on the `Candidate` model, Prisma returns it by default when using
`findUnique` without an explicit `select`. Verify no explicit `select` is omitting it.
If there is an explicit `select`, add `preScreeningError: true`.

### `apps/backend/src/services/screening.service.ts`

No changes. `runPreScreening` keeps its synchronous throw-on-error behavior — the
controller is responsible for the fire-and-forget wrapper and error capture.

### `apps/backend/src/services/postScreening.service.ts`

No changes. Same reasoning as above.

---

## § FE Component Tree

### Updated: `apps/frontend/src/lib/types.ts`

Add `preScreeningError` to `CandidateDetail`:

```typescript
export interface CandidateDetail extends CandidateListItem {
  notes: string | null;
  preScreeningError: string | null;   // F-29 — new field
  preScreening: { ... } | null;       // unchanged
  postScreening: { ... } | null;      // unchanged
}
```

### Updated: `apps/frontend/src/components/PreScreeningTab.tsx`

The component must implement a polling loop after the user clicks "Run Pre-Screening".

**State machine — new states:**

| State | Meaning |
|-------|---------|
| `idle` | No pre-screening data, not polling |
| `polling` | 202 received, polling GET /candidates/:id every 3s |
| `error` | `candidate.preScreeningError` is set or network error |
| `done` | `candidate.status` is `pre_screened` (or preScreening data present) |

The existing `loading` state is replaced by `polling`.

**Polling logic (in `handleRunPreScreening`):**

```
1. POST /candidates/:id/pre-screen
2. If 202 → setScreeningState('polling'), start interval
3. Interval (3000ms): call onRefresh() which re-fetches GET /candidates/:id
   and updates the `candidate` prop in the parent
4. Stop polling when:
   a. candidate.status === 'pre_screened', OR
   b. candidate.preScreeningError is not null
5. On stop: if preScreeningError → setScreeningState('error'), setError(candidate.preScreeningError)
            else → setScreeningState('done')
6. On POST error (non-202): setScreeningState('error'), setError(...)
```

Because `PreScreeningTab` receives `candidate` as a prop (not local state), the
parent `CandidateDetailPage` is responsible for re-fetching. The tab detects
completion by watching the incoming `candidate` prop via `useEffect`.

**Implementation approach — use `useEffect` + `useRef` for interval cleanup:**

```typescript
const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

// Watch for polling completion
useEffect(() => {
  if (screeningState !== 'polling') return;

  if (candidate.status === 'pre_screened' || candidate.preScreening != null) {
    stopPolling();
    setLocalResult(candidate.preScreening);
    setScreeningState('done');
  } else if (candidate.preScreeningError) {
    stopPolling();
    setError(candidate.preScreeningError);
    setScreeningState('error');
  }
}, [candidate, screeningState]);

function startPolling() {
  pollingRef.current = setInterval(() => {
    onRefresh(); // triggers parent re-fetch; result flows back via candidate prop
  }, 3000);
}

function stopPolling() {
  if (pollingRef.current) {
    clearInterval(pollingRef.current);
    pollingRef.current = null;
  }
}

// Cleanup on unmount
useEffect(() => () => stopPolling(), []);
```

**Polling UI (replaces the old `loading` render block):**

```tsx
if (screeningState === 'polling') {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">Analyzing...</p>
    </div>
  )
}
```

**Error display:** reuse existing error state render — the `error` string will be
`"Pre-screening failed. Please try again."` (set from `candidate.preScreeningError`
or the fallback string). No change to the JSX for error state.

### Updated: `apps/frontend/src/components/PostScreeningTab.tsx`

Mirror the same polling pattern as `PreScreeningTab`.

**State machine — new states:**

| State | Meaning |
|-------|---------|
| `idle` | No post-screening data, not polling |
| `polling` | 202 received, polling GET /candidates/:id every 3s |
| `error` | `candidate.preScreeningError` is set or network error |
| `done` | `candidate.status` is `decided` (or postScreening data present) |

The existing `uploading` state is replaced by `polling`.

**Polling stop conditions:**
- `candidate.status === 'decided'`, OR
- `candidate.preScreening` is not null AND `candidate.postScreening?.aiRecommendation` is not null, OR
- `candidate.preScreeningError` is not null

**Polling UI (replaces old `uploading` render block):**

```tsx
if (screeningState === 'polling') {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">Analyzing...</p>
    </div>
  )
}
```

**Error display:** same as PreScreeningTab — use `candidate.preScreeningError` as
the error string. Fallback: `"Post-screening failed. Please try again."`.

### No changes to:
- `CandidateDetailPage.tsx` — `fetchCandidate` already works; `onRefresh` callback
  already triggers a full GET /candidates/:id re-fetch; both tabs already receive
  the updated `candidate` prop after refresh.
- `DashboardPage.tsx`
- All other components

---

## § Test Plan

### BE — Vitest integration tests (`apps/backend/src/tests/`)

Add a new file: `apps/backend/src/tests/asyncScreening.test.ts`

**Pre-screen async tests:**

1. `POST /candidates/:id/pre-screen` with valid candidate returns 202 and `{ message: "Pre-screening started" }`.
2. `POST /candidates/:id/pre-screen` with non-existent candidate returns 404.
3. `POST /candidates/:id/pre-screen` with candidate that has no files returns 400.
4. `POST /candidates/:id/pre-screen` clears `preScreeningError` before responding.
5. Background success path: mock `runPreScreening` to resolve — verify `Candidate.status`
   becomes `pre_screened` and `preScreeningError` remains null after the async work completes.
6. Background failure path: mock `runPreScreening` to reject — verify `Candidate.preScreeningError`
   is set to the error message string.

**Post-screen async tests:**

7. `POST /candidates/:id/post-screen` with valid transcript returns 202.
8. `POST /candidates/:id/post-screen` without transcript returns 400.
9. `POST /candidates/:id/post-screen` with non-existent candidate returns 404.
10. Background failure path: mock `runPostScreening` to reject — verify
    `Candidate.preScreeningError` is set.

**GET /candidates/:id tests:**

11. Response includes `preScreeningError` field (null when clean).
12. Response includes `preScreeningError` with the error string when set.

**Testing pattern for background jobs:** Since fire-and-forget is not directly awaitable
in tests, use one of these approaches:
- Spy/mock `runPreScreening` to resolve/reject a promise, then `await` the mocked promise
  resolution before asserting DB state, OR
- Expose the async helper (`runPreScreeningAsync`) as a named export for direct testing.

Recommended: export `runPreScreeningAsync` and `runPostScreeningAsync` from the controller
as named exports (not default) so tests can call them directly without going through HTTP.

### FE — Vitest unit tests (`apps/frontend/src/tests/`)

Add or extend tests for `PreScreeningTab` and `PostScreeningTab`:

1. After receiving 202, component enters `polling` state and renders spinner + "Analyzing...".
2. When `candidate.status` transitions to `pre_screened`, polling stops and `done` state renders.
3. When `candidate.preScreeningError` is set, polling stops and error message renders.
4. `clearInterval` is called on unmount (no interval leak).
5. Same four tests mirrored for `PostScreeningTab`.

---

## § Migration Command Reference

```bash
# From apps/backend/
npx prisma migrate dev --name epic11_prescreening_error

# Apply to local test DB
DATABASE_URL=postgresql://edgar.hernandez@localhost/recruitment_test npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

The migration must be committed alongside the code changes.
