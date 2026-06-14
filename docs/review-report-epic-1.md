# Review Report — Epic 1: Foundation + Auth

**Date:** 2026-05-09
**Phase:** 3.0-complete
**Epic F-IDs in scope:** F-19, F-20, F-21, F-22, F-23

---

## Prior Issue Fixes

None — this is Epic 1, the first TechLead pass.

---

## Test Results

### Backend (Vitest)
```
Test Files  2 passed | 2 skipped (4)
Tests       9 passed | 7 todo (16)
```
- `health.test.ts` — 1 integration test: GET /health returns 200 with `status: "ok"` and a valid ISO timestamp. PASS
- `auth.test.ts` — 8 integration tests covering: valid login (200), missing email (400), missing password (400), empty body (400), wrong password (401), unknown email (401), missing auth header on protected route (401), invalid token on protected route (401). PASS
- `candidates.test.ts` / `screening.test.ts` — skipped (7 todo stubs for Epics 2–4). Expected.

### Frontend (Vitest)
```
Test Files  2 passed (2)
Tests       8 passed (8)
```
- `LoginPage.test.tsx` — 5 tests: renders form fields + title, calls POST /auth/login with correct args, stores token + navigates on success, shows destructive alert on 401, disables button while in-flight. PASS
- `ProtectedRoute.test.tsx` — 2 tests: redirects to /login when no token, renders protected content when valid token present. PASS

**Total: 17 tests passed, 0 failed.**

---

## API Contract Conformance

### GET /health
- Route: `apps/backend/src/routes/health.ts` mounts `GET /health` — PASS
- Controller returns `{ status: "ok", timestamp: <ISO-8601> }` — PASS
- No auth required — registered before authMiddleware in `app.ts` — PASS

### POST /auth/login
- Route: `apps/backend/src/routes/auth.ts` mounts `POST /auth/login` — PASS
- Request body validated with Zod (`email` + `password`, min length 1 each) — PASS
- Response 200: `{ token, recruiter: { id, email, name } }` — PASS
- `passwordHash` never included in response — PASS
- Response 400 on missing fields: `{ error: "email and password are required" }` — PASS
- Response 401 on bad credentials: `{ error: "Invalid email or password" }` — PASS
- JWT signed HS256 with `process.env.JWT_SECRET`; payload: `{ sub, email, name, iat, exp }` with 1h expiry — PASS
- 401 returned for non-existent email (no field enumeration) — PASS

### Auth middleware (`src/middleware/auth.ts`)
- Reads `Authorization: Bearer <token>` header — PASS
- Valid token: decodes and attaches to `req.recruiter`, calls `next()` — PASS
- Missing header: 401 `{ error: "Authorization header required" }` — PASS
- Invalid/expired token: 401 `{ error: "Invalid or expired token" }` — PASS
- Applied in `app.ts` after `/health` and `/auth/login` routes, before all other routers — PASS

---

## Database Schema Conformance

**Spec (design-epic-1.md):**
```
Recruiter: id (UUID PK), email (unique), passwordHash, name, createdAt, updatedAt — @@map("recruiters")
```

**Actual `prisma/schema.prisma`:**
- `id String @id @default(uuid())` — PASS
- `email String @unique` — PASS
- `passwordHash String` — PASS
- `name String` — PASS
- `createdAt DateTime @default(now())` — PASS
- `updatedAt DateTime @updatedAt` — PASS
- `@@map("recruiters")` — PASS

**Schema deviation (documented):** The `datasource db` block omits `url = env("DATABASE_URL")`. Instead, the connection string is wired through `prisma.config.ts` (Prisma 7.x pattern using `PrismaPg` adapter). This is a deliberate Prisma 7.x adaptation; the migration SQL produced is identical to what the spec schema would generate. The migration file confirms the correct table structure.

**Migration:** `20260509180838_epic_1_foundation_auth` present and matches schema. PASS

**Seed (`prisma/seed.ts`):**
- Upserts `recruiter@gorilla.com` with bcrypt hash (cost 10) — PASS
- `name: "Gorilla Recruiter"` — PASS
- Safe to re-run (upsert on email) — PASS
- `package.json` `"prisma": { "seed": "tsx prisma/seed.ts" }` — PASS
- `prisma.config.ts` `migrations.seed: "tsx prisma/seed.ts"` — PASS

---

## Security Review

- No API keys, credentials, or PII hardcoded in source — PASS
- `.env.example` contains only placeholder values — PASS
- No `.env` file committed — PASS
- CORS configured to `process.env.CORS_ORIGIN` (defaults to `http://localhost:5173`); not wildcard — PASS
- Auth middleware present and correctly wired as passthrough for pre-5.5 (no enforcement gap) — PASS
- JWT secret sourced from `process.env.JWT_SECRET` — PASS
- bcrypt cost factor 10 on all password operations — PASS

---

## Code Quality

**TypeScript:**
- No `any` types found in backend or frontend source files
- Strict mode active in backend `tsconfig.json`

**Zod validation:**
- `POST /auth/login` request body validated with `loginSchema` in `auth.controller.ts` — PASS
- No other request bodies in Epic 1

**Dead code / unused imports:** None observed

**Folder structure:**
- All required files from `design-epic-1.md § BE Folder Structure` are present — PASS
- All stub files created (`candidates.ts`, `screening.ts`, controller stubs, service stubs, middleware stubs) — PASS
- Frontend structure matches spec — PASS

**One minor note (LOW):** `LoginPage.tsx` calls `axios.post` directly (bare `axios` import) rather than the project-level `api` Axios instance from `src/lib/api.ts`. This means the 401 interceptor in `api.ts` does not cover the login call itself, but the login route is public and does not return 401 for auth failures in a way that would need logout handling — it is functionally correct. However, for consistency future epics should ensure all API calls go through the shared `api` instance.

---

## BRD Functional Coverage (Epic 1 F-IDs)

| F-ID | Requirement | Status | Notes |
|------|-------------|--------|-------|
| F-19 | Recruiter model: id (UUID), email (unique), passwordHash, name, timestamps | PASS | Schema and migration verified |
| F-20 | POST /auth/login returns signed JWT (1h) | PASS | HS256, 1h expiry, correct payload |
| F-21 | Auth middleware protects all routes except GET /health and POST /auth/login | PASS | Middleware ordering in app.ts verified |
| F-22 | /login page exists; 401 redirects to /login; logout clears localStorage | PASS | LoginPage, ProtectedRoute, Navbar, api.ts 401 interceptor all present |
| F-23 | Seed creates recruiter@gorilla.com / password123 on every prisma migrate dev | PASS | Upsert verified; both package.json and prisma.config.ts wired |

**Epic 1 coverage: 5/5 (100%)**

---

## Sign-off

All tests pass. All F-IDs for Epic 1 are fully implemented. No blockers found.

**APPROVED — Epic 1 passes TechLead review.**
