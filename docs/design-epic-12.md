# Design — Epic 12 (Amendment F-30)

**Status:** Draft  
**Date:** 2026-05-19  
**Scope:** F-30 only — frontend-only polling bug fix  
**Files affected:** `apps/frontend/src/pages/CandidateDetailPage.tsx` only  
**Backend changes:** None  
**DB schema changes:** None  
**New endpoints:** None  

---

## § FE Component Tree (delta)

### Changed component: `CandidateDetailPage`

**Route:** `/candidates/:id`  
**File:** `apps/frontend/src/pages/CandidateDetailPage.tsx`

#### Root cause

`fetchCandidate()` calls `setLoading(true)` on every invocation. The `loading` state
controls a top-level skeleton guard (the `if (loading)` block at line 72). When
`setLoading(true)` fires during a polling refresh, React re-renders the skeleton and
unmounts the entire tab tree, including whichever tab is currently mounted.

`PreScreeningTab` and `PostScreeningTab` each register a `useEffect` cleanup that calls
`stopPolling()` (clears the `setInterval` ref). Because the components unmount, the
cleanup fires and destroys the interval. When the components remount on the next render
(after `setLoading(false)`), they observe `candidate.status` unchanged and re-enter
`idle` — polling never restarts. The screened result never appears without a manual page
refresh.

#### Fix — `silent` parameter on `fetchCandidate`

Add a `silent: boolean` parameter (default `false`) to `fetchCandidate`.

**Behaviour matrix:**

| Call site | `silent` | `setLoading(true)` | `setLoading(false)` | Skeleton shown |
|-----------|----------|--------------------|---------------------|----------------|
| Initial page load (`useEffect` on mount / id change) | `false` (default) | yes | yes | yes |
| Polling refresh (`onRefresh` callback from tabs) | `true` | skipped | skipped | no |

#### Exact change required

```typescript
// BEFORE
const fetchCandidate = () => {
  if (!id) return
  setLoading(true)
  api
    .get<CandidateDetail>(`/candidates/${id}`)
    .then(({ data }) => setCandidate(data))
    .catch((err: unknown) => { ... })
    .finally(() => setLoading(false))
}
```

```typescript
// AFTER
const fetchCandidate = (silent = false) => {
  if (!id) return
  if (!silent) setLoading(true)
  api
    .get<CandidateDetail>(`/candidates/${id}`)
    .then(({ data }) => setCandidate(data))
    .catch((err: unknown) => { ... })
    .finally(() => { if (!silent) setLoading(false) })
}
```

#### Call-site changes

1. `useEffect` on mount — no change; calls `fetchCandidate()` with no argument (silent=false, shows skeleton).
2. `onRefresh` prop passed to `PreScreeningTab` — change from `fetchCandidate` to `() => fetchCandidate(true)`.
3. `onRefresh` prop passed to `PostScreeningTab` — change from `fetchCandidate` to `() => fetchCandidate(true)`.

#### JSX delta

```tsx
// BEFORE
<PreScreeningTab candidate={candidate} onRefresh={fetchCandidate} />
...
<PostScreeningTab candidate={candidate} onRefresh={fetchCandidate} />

// AFTER
<PreScreeningTab candidate={candidate} onRefresh={() => fetchCandidate(true)} />
...
<PostScreeningTab candidate={candidate} onRefresh={() => fetchCandidate(true)} />
```

#### What does NOT change

- No changes to `PreScreeningTab.tsx` — the component calls `onRefresh()` exactly as before.
- No changes to `PostScreeningTab.tsx` — same.
- No changes to `lib/types.ts`, `lib/api.ts`, or any other file.
- The `error` state path is unchanged: a fetch error during silent polling sets `setError`
  but does NOT call `setLoading(false)` (already guarded by `if (!silent)`). The error
  banner renders inside the existing candidate layout without unmounting tabs.
- The `finally` block must guard `setLoading(false)` with `if (!silent)` — the `.finally`
  fires for both success and error paths, so the guard must live there, not only in
  `.then`.

#### TypeScript signature

```typescript
const fetchCandidate = (silent = false): void => { ... }
```

No TypeScript errors expected. `silent` defaults to `false` so all existing callers
(`fetchCandidate()`) continue to work without changes.

#### Test implications

- Existing unit tests for `CandidateDetailPage` that call `fetchCandidate()` (no argument)
  continue to pass — skeleton still rendered on initial load.
- If a test for the polling case exists, update the `onRefresh` mock to pass `() =>
  fetchCandidate(true)` rather than `fetchCandidate` directly. In practice, `PreScreeningTab`
  and `PostScreeningTab` tests mock `onRefresh` as a jest/vitest `vi.fn()` and do not call
  through to `CandidateDetailPage`, so no test file changes are expected.
- The FE developer agent must run `npm test` in `apps/frontend` and confirm 0 failures
  after the change.

---

## § API Contract delta

No changes. All endpoints are unchanged from prior epics.

---

## § DB Schema delta

No changes. Schema is unchanged from Epic 11 (`preScreeningError String?` field remains).
