---
epic: 1
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-1.md]
---

Date: 2026-05-09
Phase: 1.0-complete

## API Endpoints
GET  /health          — liveness probe, returns { status, timestamp }, no auth
POST /auth/login      — accepts { email, password }, returns { token, recruiter }, no auth

## Database Models
Recruiter: id (UUID PK), email (unique), passwordHash, name, createdAt, updatedAt — table: recruiters

## Anthropic Call Points
None — Epic 1 is Foundation + Auth only. First Anthropic call is in Epic 3 (POST /candidates/:id/pre-screen).

## Infrastructure
Frontend: AWS S3 + CloudFront (HTTPS, custom domain, ACM cert)
Backend: AWS Lightsail ($3.50/mo) — Node.js managed by PM2
Database: Supabase free tier (PostgreSQL)
IaC: Terraform

## Required Env Vars
DATABASE_URL, JWT_SECRET, PORT, VITE_API_URL

## Key Design Decisions
- Auth middleware (apps/backend/src/middleware/auth.ts) scaffolded in Epic 1 so Epic 2 can import it immediately
- All stub files created in Epic 1 so the full folder structure is visible from day one
- AuthContext uses React Context (not Zustand) for Epic 1; Epic 2 may introduce a store if needed
- JWT payload: sub (UUID), email, name, iat, exp (iat+3600), signed HS256
- bcrypt cost factor: 10 for seed script and all future password hashes
- Seed uses upsert on email — safe to run on every prisma migrate dev without duplicates
- ProtectedRoute redirects to /login on !isAuthenticated; Axios 401 interceptor also triggers logout()

## Deviations from BRD
None
