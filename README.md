# Solo Mode

A Claude Code framework that autonomously builds and deploys a full-stack application from a single BRD and one command.

**Two layers in one repo:**

- **Solo Mode Framework** — the meta-product: Claude Code skills and agent definitions that execute the full SDLC
- **Recruitment App** — the demo product built _by_ the framework: an AI-powered candidate pre/post screening tool

---

## How it works

```
brd.md  (your requirements)
   ↓
/solo-mode  ← single command
   ↓
Architect → Developer BE + Developer FE (parallel) → TechLead → DevOps → QA → Auth
   ↓
Deployed app ✅
```

Each agent is fully autonomous. State is persisted in `docs/.phase` so any interrupted run resumes from the last completed phase.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) with a Pro or Team plan
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier) — provides the PostgreSQL database
- An [Anthropic API key](https://console.anthropic.com) — used by the Recruitment App for candidate analysis
- AWS credentials (only required for Phase 4 cloud deployment)

---

## Quick start

1. **Clone the repo**

   ```bash
   git clone <repo-url>
   cd solo-mode
   ```

2. **Create `.env`** at the project root:

   ```
   DATABASE_URL="postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres"
   ANTHROPIC_API_KEY="sk-ant-..."
   ```

3. **Run the framework**
   ```bash
   # Inside Claude Code
   /solo-mode
   ```

Phases 1–3 run entirely locally (no AWS needed). After phase 3 completes you have a working app at `http://localhost:5173`.

Phase 4 (cloud deploy) requires AWS credentials configured via `aws configure` or environment variables.

---

## Running the generated app locally

After a successful phases 1–3 run:

```bash
# Terminal 1 — Backend (port 3001)
cd apps/backend
npm install
npx prisma migrate deploy
npm run dev

# Terminal 2 — Frontend (port 5173)
cd apps/frontend
npm install
npm run dev
```

Then open `http://localhost:5173`.

---

## Repository structure

```
solo-mode/
├── CLAUDE.md                        ← Global agent contract (tech stack, standards, rules)
├── brd.md                           ← Source of truth for all requirements
├── docs/
│   ├── .phase                       ← Current SDLC phase (agents read/write this)
│   ├── design.md                    ← Architect output — blueprint for all downstream agents
│   └── brd-coverage.md              ← QA traceability matrix
├── .claude/
│   ├── agents/                      ← Agent definitions
│   │   ├── 01-architect-agent.md
│   │   ├── 02-developer-fe-agent.md
│   │   ├── 03-developer-be-agent.md
│   │   ├── 04-techlead-agent.md
│   │   ├── 06-devops-agent.md
│   │   └── 05-qa-agent.md
│   ├── agent-memory/                ← Compact inter-agent handoff summaries (written at runtime)
│   └── skills/solo-mode/
│       └── SKILL.md                 ← /solo-mode master orchestrator
├── apps/                            ← Generated at runtime by Developer agents
│   ├── frontend/                    ← React + Vite + Tailwind + shadcn/ui
│   └── backend/                     ← Node.js + Express + Prisma
└── infrastructure/
    └── terraform/                   ← IaC written by DevOps agent
```

---

## Tech stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | React + Vite, Tailwind CSS, shadcn/ui             |
| Backend  | Node.js + Express, Prisma ORM                     |
| Database | PostgreSQL via Supabase (same URL local + prod)   |
| AI/LLM   | Anthropic Claude API (`claude-sonnet-4-6`)        |
| Deploy   | AWS S3 (frontend) + AWS Lightsail + PM2 (backend) |
| IaC      | Terraform                                         |
| CI/CD    | GitHub Actions                                    |
| Testing  | Playwright (E2E) + Vitest (unit)                  |

---

## Recruitment App

The demo product built by the framework. Helps recruiters evaluate candidates in two AI-powered phases:

**Phase 1 — Pre-screening**
Upload a CV (PDF) and LinkedIn export. Claude analyzes the candidate, generates personalized interview questions, and flags inconsistencies between the CV and LinkedIn profile.

**Phase 2 — Post-screening**
Upload the interview transcript. Claude evaluates the candidate's responses and produces a Pass / No Pass recommendation with full reasoning. The recruiter can override the recommendation before finalizing.

---

## SDLC phases

| Phase | Agent        | Output                                  |
| ----- | ------------ | --------------------------------------- |
| 1.0   | Architect    | `docs/design.md` — full app blueprint   |
| 2.0   | Developer BE | `apps/backend/` — Express + Prisma API  |
| 2.1   | Developer FE | `apps/frontend/` — React frontend       |
| 3.0   | TechLead     | Test results, bug fixes, sign-off       |
| 4.0   | DevOps       | Terraform IaC, GitHub Actions, live URL |
| 5.0   | QA           | Playwright E2E, BRD coverage report     |
| 5.5   | Auth         | JWT middleware on all protected routes  |

If a run is interrupted, re-run `/solo-mode` — it resumes from the last completed phase.

---

## Inspiration

Based on the Solo AI-First SDLC methodology by Marco Vargas. This implementation is one-shot (BRD → deployed app) rather than sprint-based, optimized for demonstrating autonomous end-to-end delivery.
