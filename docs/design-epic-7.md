# Design — Epic 7: F-25 CI Test Auth Fix

**Epic:** 7
**Amendment:** F-25
**Scope:** Backend test infrastructure only — no production code changes, no schema changes, no FE changes

---

## § Problem Statement

**Root cause:** 42 backend tests fail in CI with HTTP 401 on all protected routes.

Every test file that exercises protected endpoints contains a local `getAuthToken()` helper:

```ts
async function getAuthToken(): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email: "recruiter@gorilla.com", password: "password123" });
  return res.body.token as string;
}
```

This helper depends on the `recruiters` table containing a row for `recruiter@gorilla.com`. Locally this row exists because `prisma db seed` has been run. In CI (`ci.yml`) the workflow runs `prisma migrate deploy` to create the schema but **has no seed step**. The table is empty, so `POST /auth/login` returns a 401 with `{ error: "Invalid email or password" }`, `res.body.token` is `undefined`, and every subsequent request is sent with `Authorization: Bearer undefined` — which the auth middleware rejects with another 401.

`health.test.ts` does not call `getAuthToken()` and only tests the unprotected `GET /health` — it is not among the 42 failures.
`auth.test.ts` calls `POST /auth/login` directly as its subject under test — it is also not among the 42 failures (the login itself fails, but the test assertions are about 401/400 behavior, which still holds from the empty-DB state).

**Affected files with `getAuthToken()` that must be updated:**

| File | Approximate failing test count |
|------|-------------------------------|
| `apps/backend/src/tests/candidates.test.ts` | ~15 |
| `apps/backend/src/tests/screening.test.ts` | ~10 |
| `apps/backend/src/tests/postScreening.test.ts` | ~17 |
| `apps/backend/src/tests/report.test.ts` | ~7 |

Total: ~49 tests that call `getAuthToken()` — after filtering the tests that explicitly expect 401 without a token (these are correct and must not be changed), approximately 42 are currently failing.

---

## § Solution

Replace the `getAuthToken()` database round-trip with a direct JWT token generation call. The `generateToken()` function in `apps/backend/src/services/auth.service.ts` already accepts `{ sub, email, name }` + `secret` and returns a signed HS256 token. No database query is needed to produce a valid JWT.

**New file to create:**

```
apps/backend/src/tests/helpers/auth.ts
```

**Contract:**

```ts
// Returns a valid Authorization header value: "Bearer <token>"
export function makeAuthHeader(): string

// Returns just the raw token string (for tests that need it separately)
export function makeAuthToken(): string
```

**Implementation specification:**

```ts
import { generateToken } from "../../services/auth.service.js";

const TEST_RECRUITER = {
  sub:   "00000000-0000-0000-0000-000000000001",
  email: "recruiter@gorilla.com",
  name:  "Gorilla Recruiter",
};

export function makeAuthToken(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  return generateToken(TEST_RECRUITER, secret);
}

export function makeAuthHeader(): string {
  return `Bearer ${makeAuthToken()}`;
}
```

Design notes:
- The `sub` UUID is arbitrary — the auth middleware only validates the JWT signature and expiry, it does not look up the recruiter in the DB. Any well-formed UUID works.
- `JWT_SECRET` must match the value used by the running `createApp()` instance. In CI it is already set: `JWT_SECRET: ci-test-secret-not-real` (see `ci.yml` line 55). No new secrets required.
- The token expires in 1 hour (inherited from `generateToken`). Test suites complete well under that window.

---

## § File-by-File Update Pattern

For each of the four test files, the change is mechanical:

### Step 1 — Remove the inline `getAuthToken()` function

Delete the entire `async function getAuthToken()` block from each file.

### Step 2 — Add the import at the top of each file

```ts
import { makeAuthToken } from "./helpers/auth.js";
```

### Step 3 — Replace every call site

Before:
```ts
const token = await getAuthToken();
```

After:
```ts
const token = makeAuthToken();
```

Note: `makeAuthToken()` is synchronous — remove `await` at every call site.

### Step 4 — Verify tests that explicitly assert 401 without a token are unchanged

These tests do NOT call `getAuthToken()` and must not be modified:
- `candidates.test.ts`: "returns 401 when no auth token" tests in POST, GET, GET/:id suites
- `report.test.ts`: "returns 401 when no auth token" test

---

## § Affected Files Summary

| File | Change type |
|------|-------------|
| `apps/backend/src/tests/helpers/auth.ts` | CREATE — new shared utility |
| `apps/backend/src/tests/candidates.test.ts` | UPDATE — replace `getAuthToken()` |
| `apps/backend/src/tests/screening.test.ts` | UPDATE — replace `getAuthToken()` |
| `apps/backend/src/tests/postScreening.test.ts` | UPDATE — replace `getAuthToken()` |
| `apps/backend/src/tests/report.test.ts` | UPDATE — replace `getAuthToken()` |

No changes to:
- `apps/backend/src/tests/health.test.ts` — no auth required, not failing
- `apps/backend/src/tests/auth.test.ts` — tests `POST /auth/login` directly; not among the 42 failures
- `apps/backend/src/tests/fileParser.test.ts` — no HTTP calls, no auth
- Any production source file
- `.github/workflows/ci.yml` — `JWT_SECRET` is already present
- Prisma schema / migrations
- Frontend code

---

## § CI Environment Confirmation

`JWT_SECRET` is already configured in `.github/workflows/ci.yml`:

```yaml
- name: Run backend tests
  run: npm test
  working-directory: apps/backend
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
    JWT_SECRET: ci-test-secret-not-real   # ← already present
    NODE_ENV: test
    AWS_UPLOADS_BUCKET: test-bucket
    AWS_REGION: us-east-1
    AWS_ACCESS_KEY_ID: test-key-id
    AWS_SECRET_ACCESS_KEY: test-secret-key
    ANTHROPIC_API_KEY: test-anthropic-key
```

No CI workflow changes are needed.

---

## § Acceptance Criteria

After the Developer BE agent applies this fix:

1. `npm test` in `apps/backend/` passes all tests locally with `JWT_SECRET` set
2. The CI `test-backend` job passes with zero failures on a pull request
3. Tests that assert `401` behavior for unauthenticated requests continue to pass — they must not be accidentally given auth headers
4. No production source files are modified
5. `amendments.md` F-25 `Status` is updated from `pending` to `done`
