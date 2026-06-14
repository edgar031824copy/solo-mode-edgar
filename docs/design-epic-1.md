# Design — Epic 1: Foundation + Auth

**Epic:** 1
**Phase:** 1.0-complete
**F-IDs in scope:** F-19, F-20, F-21, F-22, F-23
**NF-IDs in scope:** NF-03, NF-04
**Status:** write-once contract — do not overwrite; amend specific sections only

---

## § DB Schema

Full Prisma schema block for Epic 1. Only the `Recruiter` model is introduced here.
Subsequent epics will add `Candidate` and related models — they must append to this schema without touching the `Recruiter` model.

```prisma
// apps/backend/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Recruiter {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("recruiters")
}
```

**Design decisions:**

- `id` uses UUID (`@default(uuid())`) rather than auto-increment int to avoid sequential ID enumeration attacks and support future sharding.
- `@@map("recruiters")` keeps table name consistent with snake_case PostgreSQL convention while keeping the Prisma model name PascalCase.
- `passwordHash` stores only the bcrypt hash — plaintext password is never persisted.
- `createdAt`/`updatedAt` are included on every model for auditability.
- Epic 2 will add the `Candidate` model with a relation to `Recruiter`. When that migration runs, the Recruiter table is untouched.

---

## § API Contract

All endpoints below are the **only** endpoints implemented in Epic 1.
Epic 2+ will add Candidate CRUD, file upload, and AI endpoints.

Auth boundary: `GET /health` and `POST /auth/login` are public. Every other route added in future epics **must** require `Authorization: Bearer <token>`.

---

### GET /health

```
Method:         GET
Path:           /health
Auth required:  no
Request body:   none

Response 200:
{
  "status": "ok",
  "timestamp": "ISO-8601 string"
}

Response 5xx:
{
  "error": "string — reason for service unavailability"
}
```

Purpose: liveness probe used by load balancers, uptime monitors, and CI smoke tests. Returns 200 if Express is running and can respond.

---

### POST /auth/login

```
Method:         POST
Path:           /auth/login
Auth required:  no
Content-Type:   application/json

Request body:
{
  "email":    "string — recruiter email address",
  "password": "string — plaintext password (transmitted over HTTPS only)"
}

Response 200:
{
  "token": "string — signed JWT, 1h expiry",
  "recruiter": {
    "id":    "string — UUID",
    "email": "string",
    "name":  "string"
  }
}

Response 400:
{
  "error": "email and password are required"
}

Response 401:
{
  "error": "Invalid email or password"
}

Response 500:
{
  "error": "Internal server error"
}
```

**JWT payload:**
```json
{
  "sub":   "<recruiter UUID>",
  "email": "<recruiter email>",
  "name":  "<recruiter name>",
  "iat":   <issued-at epoch seconds>,
  "exp":   <expiry epoch seconds — iat + 3600>
}
```

**Implementation notes:**
- Compare password against stored hash using `bcrypt.compare()`.
- Sign with `jsonwebtoken` using `process.env.JWT_SECRET` (HS256).
- Never include `passwordHash` in any response payload.
- Return 401 (not 404) when email does not exist — do not leak which field failed.

---

### Auth middleware (applied to all future routes)

This is not an endpoint but must be implemented as part of Epic 1 scaffold so Epic 2 can import and apply it.

```
File: apps/backend/src/middleware/auth.ts

Behavior:
  - Read Authorization header; expect format: "Bearer <token>"
  - Verify signature using JWT_SECRET
  - On valid token: attach decoded payload to req.recruiter and call next()
  - On missing header: respond 401 { "error": "Authorization header required" }
  - On invalid/expired token: respond 401 { "error": "Invalid or expired token" }
```

---

## § FE Component Tree

### Route map

| Route      | Component           | Auth guard |
|------------|---------------------|------------|
| `/login`   | `LoginPage`         | public     |
| `/*`       | Protected route shell — redirects to `/login` on 401 | guarded |

Note: Epic 1 only implements `/login` and the protected route guard. Dashboard and candidate routes are scaffolded as stubs that future epics fill in. The FE developer must create `src/pages/DashboardPage.tsx` as a stub (`<div>Dashboard — coming soon</div>`) so the protected route guard has a destination.

---

### Component hierarchy

```
App (src/App.tsx)
├── AuthProvider (src/context/AuthContext.tsx)
│   └── Router (react-router-dom BrowserRouter)
│       ├── Route path="/login"
│       │   └── LoginPage (src/pages/LoginPage.tsx)
│       │       ├── Card (shadcn/ui Card)
│       │       │   ├── CardHeader
│       │       │   │   └── CardTitle — "Recruitment Platform"
│       │       │   ├── CardContent
│       │       │   │   ├── Input (shadcn/ui) — email field
│       │       │   │   ├── Input type="password" — password field
│       │       │   │   └── Button (shadcn/ui) — "Sign in" / loading state
│       │       │   └── CardFooter — error message area
│       └── Route path="/*"
│           └── ProtectedRoute (src/components/ProtectedRoute.tsx)
│               └── Outlet → DashboardPage stub (future epics fill this)
```

---

### Component specs

#### `AuthContext` (`src/context/AuthContext.tsx`)

State shape:
```ts
interface AuthState {
  token: string | null;
  recruiter: { id: string; email: string; name: string } | null;
  isAuthenticated: boolean;
}
```

Behavior:
- Initialize from `localStorage.getItem('auth_token')` on mount; decode with `jwt-decode` to populate `recruiter`.
- `login(token, recruiter)`: store token in `localStorage`, update context state.
- `logout()`: remove `localStorage` key, reset state to null/false, navigate to `/login`.
- Export `useAuth()` hook for consumers.

#### `ProtectedRoute` (`src/components/ProtectedRoute.tsx`)

- Import `useAuth()`.
- If `isAuthenticated === false`, render `<Navigate to="/login" replace />`.
- If `isAuthenticated === true`, render `<Outlet />`.
- Also intercept Axios 401 responses globally (in `src/lib/api.ts` interceptor) — call `logout()` and navigate to `/login`.

#### `LoginPage` (`src/pages/LoginPage.tsx`)

Layout: full-viewport centered flex column (`min-h-screen flex items-center justify-center bg-gray-50`).
Card width: `w-full max-w-sm`.

Form behavior:
- Controlled inputs for `email` and `password` (local `useState`).
- On submit: call `POST /auth/login`; on success call `auth.login()` and navigate to `/`; on error display error message in `CardFooter` using a destructive `Alert` (shadcn/ui).
- Button shows spinner (shadcn/ui `Loader2` icon with `animate-spin`) while request is in-flight; disabled during loading.
- No page reload on submit — handled via `event.preventDefault()`.

#### `Navbar` (`src/components/Navbar.tsx`)

Rendered inside the protected route shell (visible on all authenticated pages).
Contains:
- App name / logo on the left.
- "Logout" `Button` variant `ghost` on the right — calls `auth.logout()` on click.

Layout: `flex items-center justify-between px-6 py-3 border-b bg-white`.

#### `src/lib/api.ts`

- Axios instance with `baseURL: import.meta.env.VITE_API_URL`.
- Request interceptor: attach `Authorization: Bearer <token>` from `localStorage` if present.
- Response interceptor: on 401, call `logout()` from AuthContext and redirect to `/login`.

---

### State management strategy

Epic 1 uses **React Context** (`AuthContext`) for auth state only. No global store (Zustand, Redux) is introduced at this stage. Subsequent epics may add a lightweight store for candidate state if needed — that decision belongs to Epic 2's Architect pass.

---

## § BE Folder Structure

This is the **complete target structure** for `apps/backend/` across all epics. Epic 1 creates every file listed here; files marked `[stub]` contain minimal boilerplate and are filled in by the relevant epic's Developer BE agent.

```
apps/backend/
├── package.json                        — Node project manifest; scripts: dev, build, start, test, migrate
├── tsconfig.json                       — TypeScript config (target: ES2020, module: CommonJS, strict: true)
├── .env.example                        — Env var template (never commit .env)
├── prisma/
│   ├── schema.prisma                   — Canonical data model (source of truth)
│   └── seed.ts                         — Default seed: recruiter@gorilla.com / password123
├── src/
│   ├── index.ts                        — Express entry point; mounts all routers; starts server
│   ├── app.ts                          — Express app factory; registers middleware + routes; exported for tests
│   ├── routes/
│   │   ├── health.ts                   — GET /health
│   │   ├── auth.ts                     — POST /auth/login
│   │   ├── candidates.ts               — [stub] CRUD + file upload (Epic 2)
│   │   └── screening.ts                — [stub] Pre/post-screening endpoints (Epics 3–4)
│   ├── controllers/
│   │   ├── health.controller.ts        — Returns { status: "ok", timestamp }
│   │   ├── auth.controller.ts          — Login logic: lookup recruiter, verify hash, sign JWT
│   │   ├── candidates.controller.ts    — [stub] Candidate CRUD handlers (Epic 2)
│   │   └── screening.controller.ts     — [stub] Screening handlers (Epics 3–4)
│   ├── services/
│   │   ├── auth.service.ts             — findRecruiterByEmail(), verifyPassword(), generateToken()
│   │   ├── candidates.service.ts       — [stub] Candidate DB operations (Epic 2)
│   │   ├── screening.service.ts        — [stub] Anthropic API calls (Epics 3–4)
│   │   └── fileParser.service.ts       — [stub] PDF/text extraction utilities (Epic 2)
│   ├── middleware/
│   │   ├── auth.ts                     — JWT verification middleware (used by all protected routes)
│   │   ├── errorHandler.ts             — Global Express error handler; maps errors to HTTP status codes
│   │   └── upload.ts                   — [stub] Multer config for file uploads (Epic 2)
│   ├── lib/
│   │   ├── prisma.ts                   — Prisma client singleton
│   │   └── logger.ts                   — [stub] Winston/pino logger (Epic 5 fills this in fully)
│   └── tests/
│       ├── health.test.ts              — Integration test: GET /health returns 200
│       ├── auth.test.ts                — Integration tests: POST /auth/login success + failure cases
│       ├── candidates.test.ts          — [stub] Epic 2 fills in
│       └── screening.test.ts           — [stub] Epics 3–4 fill in
```

**Frontend target structure** (for reference — Developer FE agent scaffolds this):

```
apps/frontend/
├── package.json                        — Vite + React + TypeScript dependencies
├── vite.config.ts                      — Proxy /api → backend in dev; build output to dist/
├── tsconfig.json
├── index.html
├── tailwind.config.ts
├── postcss.config.js
├── components.json                     — shadcn/ui config
└── src/
    ├── main.tsx                        — ReactDOM.createRoot entry
    ├── App.tsx                         — Router + AuthProvider shell
    ├── context/
    │   └── AuthContext.tsx             — Auth state + login/logout helpers
    ├── components/
    │   ├── ProtectedRoute.tsx          — Redirects unauthenticated users to /login
    │   └── Navbar.tsx                  — Top nav with logout button
    ├── pages/
    │   ├── LoginPage.tsx               — /login page (Epic 1)
    │   └── DashboardPage.tsx           — [stub] Candidate list (Epic 2 fills in)
    ├── lib/
    │   └── api.ts                      — Axios instance with auth interceptors
    └── tests/
        ├── LoginPage.test.tsx          — Vitest: renders form, submits, handles errors
        └── ProtectedRoute.test.tsx     — Vitest: redirects when not authenticated
```

---

## § Seed Script

File: `apps/backend/prisma/seed.ts`

The seed script runs automatically via the `prisma.seed` config in `package.json` — invoked on every `prisma migrate dev`.

**Behavior:**
- Upsert a single `Recruiter` record using `email` as the unique key (safe to run multiple times without creating duplicates).
- Hash `password123` with `bcrypt` (cost factor 10) and store in `passwordHash`.

**`package.json` config (required for Prisma auto-seed):**
```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

**Seed data:**
```
email:    recruiter@gorilla.com
password: password123 (hashed with bcrypt, cost 10)
name:     Gorilla Recruiter
```

---

## § Environment Variables

All variables are required at runtime. Never commit values — use `.env` locally and secrets manager in CI.

| Variable       | Used by   | Description                                               |
|----------------|-----------|-----------------------------------------------------------|
| `DATABASE_URL` | BE        | PostgreSQL connection string (Supabase in prod, local PG in dev) |
| `JWT_SECRET`   | BE        | HS256 signing secret — minimum 32 random characters       |
| `PORT`         | BE        | Express listen port (default: 4000)                       |
| `VITE_API_URL` | FE        | Base URL for Axios — e.g. `http://localhost:4000` in dev  |

`.env.example` contents:
```
DATABASE_URL=postgresql://user:password@localhost:5432/recruitment
JWT_SECRET=change-me-to-a-random-32-char-secret
PORT=4000
VITE_API_URL=http://localhost:4000
```
