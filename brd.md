# Business Requirements Document (BRD)

## Solo Mode Framework + AI Recruitment Application

**Version:** 1.1
**Reference:** Marco Vargas — Solo AI-First SDLC methodology

---

## 1. Executive Summary

This project has **two layers**:

| Layer                   | What it is                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **Solo Mode Framework** | The meta-product — a reusable framework that builds and deploys full apps autonomously using AI agents |
| **Recruitment App**     | The demo product — built _by_ the framework, proving it works end-to-end                               |

The goal is to demonstrate that one person (or a small team) can build, deploy, and deliver a fully functional cloud application by only providing a BRD and running a single command.

---

## 2. Project Objectives

- Build a **Solo Mode Framework** powered by AI agents (Architect, Developer, TechLead, DevOps, QA) orchestrated by a Master Agent.
- Use the framework to autonomously build a **Recruitment Application** that evaluates candidates via Anthropic API.
- Minimize human intervention — agents run sequentially, handle their own state, and hand off context to the next agent.
- Keep infrastructure **low-cost, disposable, and cloud-deployable** (IaC).
- Deliver a **publicly accessible, demonstrable application** at the end of the process.

---

## 3. Scope

### 3.1 In Scope

- Solo Mode Framework design, skills, and agent definitions
- Recruitment Application (pre-screening + post-screening flows)
- Frontend (React + Vite) and Backend (Node.js + Express + Prisma)
- Cloud deployment (AWS or free-tier equivalents)
- Automated testing (Playwright)
- Technical documentation (BRD, design.md, architecture decisions, cost analysis)

### 3.2 Out of Scope

- Integration with external ATS (Jira, Workday, Greenhouse) — future phase
- Mobile application
- Multi-tenant support (MVP is single-tenant)
- Custom LLM fine-tuning

---

## 4. Solo Mode Framework

### 4.1 Overview

The Solo Mode Framework is a set of **Claude Code custom skills and agent definitions** that, given a BRD as source of truth, autonomously executes the full SDLC and deploys a working application.

```
BRD (this file)
     ↓
/solo-mode  ← single command
     ↓
Master Agent orchestrates:
  → Architect Agent
  → Developer Agent (BE)  ─┐
  → Developer Agent (FE)  ─┘ (parallel)
  → TechLead Agent
  → QA Agent
  → DevOps Agent
     ↓
Deployed App ✅
```

### 4.2 CLAUDE.md — Global Contract

A single `CLAUDE.md` file acts as the **constitution** for all agents. Every agent reads it on every invocation. It defines:

- Tech stack and library choices (non-negotiable)
- Coding standards and naming conventions
- Security rules (no public repos with Gorilla data)
- Agent coordination rules and handoff format
- Cost constraints for infrastructure

### 4.3 Agent Definitions

#### 🧠 Master Agent (Skill: `/solo-mode`)

- Entry point triggered by the user
- Reads the BRD and CLAUDE.md
- Maintains **state management** (which phase is active, what has completed, where to resume)
- Spawns agents in order, with Developer FE and BE running in parallel at phase 2.x
- Runs fully autonomously — zero human interaction after trigger
- On failure: writes error to `.phase`, reports what failed and why, stops cleanly

#### 🏛️ Architect Agent

- **Input:** BRD (`brd.md`) + CLAUDE.md
- **Output:** `design.md` — full application blueprint
- Responsibilities:
  - Define FE component tree and page structure (replaces Design Agent — shadcn/ui + Tailwind used by default)
  - Define BE folder structure, routes, and controllers
  - Design database schema (ERD)
  - Define API contract (endpoint list, request/response shapes) including the auth boundary: `GET /health` and `POST /auth/login` are public; all other routes require `Authorization: Bearer <token>`
  - Specify infrastructure architecture and deployment topology
  - Document technology decisions with justification
- **No Design Agent needed:** UI design decisions are embedded in `design.md` using shadcn/ui component names and Tailwind utility classes as spec
- **Handoff:** Writes `design.md` for Developer Agents (FE + BE)

#### 👨‍💻 Developer Agent (FE)

- **Input:** `design.md` + CLAUDE.md
- **Output:** React frontend (`apps/frontend`)
- Responsibilities:
  - Implement React components with Vite + Tailwind + shadcn/ui
  - Build recruiter dashboard, file upload UI, and results screens
  - Connect to backend via REST API (axios or fetch)
  - Write inline code comments for TechLead context
  - Follow test-first approach (Vitest unit tests before implementation)
- **Handoff:** Committed FE code + updates `.phase` to `2.1-complete`

#### 👨‍💻 Developer Agent (BE)

- **Input:** `design.md` + CLAUDE.md
- **Output:** Node.js + Express API (`apps/backend`)
- Responsibilities:
  - Implement Express routes and controllers
  - Set up Prisma schema, migrations, and DB connection
  - Integrate Anthropic API (pre-screening + post-screening logic)
  - Handle file parsing (PDF/text extraction)
  - Write inline code comments for TechLead context
  - Follow test-first approach (write failing tests before implementation)
- **Handoff:** Committed BE code + updates `.phase` to `2.0-complete`

#### 🔍 TechLead Agent (Reviewer)

- **Input:** Code + `design.md` + CLAUDE.md
- **Output:** Review report + corrected code
- Responsibilities:
  - Validate code against design spec
  - Run unit tests only (Vitest) — E2E tests are owned by QA in phase 4 and do not exist yet at phase 3.0
  - Identify security issues and antipatterns
  - Fix blockers autonomously and re-run tests until they pass; only then hand off to QA
- **Handoff:** Corrected code + unit-test pass report → QA Agent

#### ✅ QA Agent (Auditor)

- **Input:** Localhost build (FE + BE running) + BRD + test cases
- **Output:** QA report + pre-deployment sign-off
- Responsibilities:
  - Run end-to-end tests on localhost (Playwright) **before** anything is deployed
  - Validate all functional requirements from BRD
  - Block DevOps deployment if coverage < 80% or any test fails
  - Generate release notes
  - Final pass/fail against success criteria

#### 🚀 DevOps Agent

- **Input:** QA-approved code + infrastructure spec from `design.md`
- **Output:** Live deployed application URL
- Responsibilities:
  - Write IaC (Terraform)
  - Provision the locked stack: AWS S3 + CloudFront + ACM certificate (frontend, HTTPS) + AWS Lightsail + PM2 (backend) + Supabase (database) — no Docker, no Lambda, no managed DB
  - Configure CI/CD pipeline (GitHub Actions)
  - Ensure environment is **disposable** (`terraform destroy` < 10 min)
  - Keep costs within defined budget
- **Handoff:** Deployment URL + environment details

---

### 4.4 Epic-Driven Execution

The Solo Mode Framework builds the recruitment app across **6 epics**. Each epic runs the full agent chain (Architect → BE + FE → TechLead → QA). DevOps runs only after Epic 6 QA passes. Agents accumulate on existing code — they never delete or replace prior work.

#### Epic Scope

| Epic | Name | F-IDs in scope | NF-IDs in scope |
|------|------|----------------|-----------------|
| 1 | Foundation + Auth | F-19, F-20, F-21, F-22, F-23 | NF-03, NF-04 |
| 2 | Candidate Management | F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18 | NF-03b |
| 3 | Pre-Screening | F-03, F-04, F-05, F-06 | — |
| 4 | Post-Screening | F-07, F-08, F-09, F-10, F-11 | — |
| 5 | Polish + Export | F-12 | NF-07 |
| 6 | Deployment | — | NF-01, NF-02, NF-05, NF-06 |

**QA coverage target per epic:** ≥ 80% of that epic's in-scope F-IDs only. QA for Epic 2 must not test F-03 through F-12 — those features do not exist yet.

#### Self-Correction Protocol

TechLead writes a `## Known Issues` section to `.claude/agent-memory/epic-N-techlead.md` after each epic. The next epic's BE and FE agents read this before implementing new features and fix all `[HIGH]` and `[MEDIUM]` issues first.

Required format:
```
## Known Issues
- [EPIC-1][HIGH] BE: <specific actionable description> — fix before Epic 2
- [EPIC-1][MEDIUM] FE: <specific actionable description> — fix before Epic 2
- [EPIC-1][LOW] FE: <specific actionable description>
- None
```

---

## 5. Recruitment Application (Demo Product)

### 5.1 Overview

An AI-powered recruitment tool that helps recruiters evaluate candidates in two phases using Anthropic's Claude API. The recruiter uploads documents and the system handles analysis, question generation, and recommendations autonomously.

### 5.2 User Roles

| Role          | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| **Recruiter** | Uploads candidate files, reviews AI output, makes final decision |
| **Admin**     | (future) Manages users and settings                              |

### 5.3 Functional Requirements

#### Phase 1 — Pre-Screening

| ID   | Requirement                                                                    |
| ---- | ------------------------------------------------------------------------------ |
| F-01 | Recruiter uploads CV (PDF), LinkedIn export, and optional notes                |
| F-02 | System parses and extracts key candidate data; stores uploaded filenames (`cvFileName`, `linkedinFileName`) on the candidate record for display in the UI |
| F-03 | Anthropic API analyzes experience, skills, and background against the target position |
| F-04 | System generates 5 personalized interview questions informed by both the candidate profile AND the target position — some questions must probe role-specific fit (what the position requires), not just verify CV claims |
| F-05 | System detects red flags and inconsistencies between CV and LinkedIn           |
| F-06 | Output displayed in recruiter dashboard: Questions, Red Flags, Profile Summary |

#### Phase 2 — Post-Screening

| ID   | Requirement                                                          |
| ---- | -------------------------------------------------------------------- |
| F-07 | Recruiter uploads interview transcript (text or audio-to-text)       |
| F-08 | Anthropic API evaluates candidate responses against expected profile |
| F-09 | System generates final recommendation: **Pass / No Pass**            |
| F-10 | Recruiter can manually override the system recommendation — decision buttons are context-aware: when AI recommends "pass", show "Confirm Pass" + "Override: No Pass"; when AI recommends "no_pass", show "Confirm No Pass" + "Override: Pass"; once a decision is submitted, replace the buttons with a badge showing the recruiter's outcome (Pass/No Pass) and a label ("Confirmed by recruiter" or "Overridden by recruiter"); this decided state must also load correctly on page refresh |
| F-11 | System logs all decisions (AI recommendation + recruiter override)   |
| F-12 | Final report exportable (PDF or JSON)                                |

#### Recruiter Dashboard (UI)

| ID   | Requirement                                                     |
| ---- | --------------------------------------------------------------- |
| F-13 | Simple, intuitive UI — no technical knowledge required          |
| F-14 | Candidate list view with status (pending / pre_screened / decided); decided candidates also show a Pass (green) or No Pass (red) badge derived from the recruiter's recorded choice — `GET /candidates` must return `recruiterChoice` for this column |
| F-15 | Single candidate detail view — tab-based layout (Pre-Screening tab / Post-Screening tab) with a Details card at the top showing Created, Updated, CV File, LinkedIn File, Notes; no side-by-side columns |
| F-16 | File upload interface (drag & drop or button)                   |
| F-17 | One-click execution button for each phase                       |
| F-18 | Delete candidate button in dashboard actions menu — permanently removes candidate and all related records from the database (cascade delete); requires a confirmation dialog before deletion |

#### Authentication

| ID   | Requirement |
| ---- | ----------- |
| F-19 | System has a `Recruiter` model with `id`, `email` (unique), `passwordHash`, and `name` |
| F-20 | `POST /auth/login` accepts `{ email, password }` and returns a signed JWT (1 h expiry) |
| F-21 | All API routes except `GET /health` and `POST /auth/login` require `Authorization: Bearer <token>` |
| F-22 | Frontend has a `/login` page; unauthenticated users are redirected there on any 401 response; a logout button in the navigation bar clears the JWT from localStorage and redirects to `/login` |
| F-23 | A seed script creates default credentials (`recruiter@gorilla.com` / `password123`) on every `prisma migrate dev` |

### 5.4 Non-Functional Requirements

| ID     | Requirement                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------- |
| NF-01  | **Cost:** Infrastructure must stay within free-tier or minimal cost during MVP                     |
| NF-02  | **Disposability:** Environments must be creatable and destroyable in minutes via IaC               |
| NF-03  | **Auth:** JWT custom middleware — implemented in phase 2 as part of the core build |
| NF-03b | **Security:** No candidate PII stored beyond session unless explicitly persisted                   |
| NF-04  | **Privacy:** Repository must remain private (no Gorilla internal data exposed)                     |
| NF-05  | **Scalability:** MVP is single-user; architecture must allow horizontal scale                      |
| NF-06  | **Availability:** Application accessible via public URL after deployment                           |
| NF-07  | **Observability:** Basic logging for agent actions and API calls                                   |

---

## 6. Technical Stack

| Layer      | Technology                                          | Notes                                           |
| ---------- | --------------------------------------------------- | ----------------------------------------------- |
| Frontend   | React + Vite                                        | Clean separation from BE, fast dev server       |
| UI Library | Tailwind CSS + shadcn/ui                            | Professional UI without a Design Agent          |
| Backend    | Node.js + Express                                   | Explicit, familiar, clear agent scope           |
| ORM        | Prisma                                              | Declarative schema, migrations                  |
| Database   | PostgreSQL (local dev) / Supabase (free tier)       | Switch based on environment                     |
| AI/LLM     | Anthropic Claude API (claude-sonnet-4-6)            | Core intelligence layer                         |
| Auth       | JWT + custom middleware                             | Implemented in phase 2 — part of the core build |
| Testing    | Playwright (E2E) + Vitest (unit)                    | Enforced by TechLead Agent                      |
| IaC        | Terraform or AWS CDK                                | DevOps Agent uses this                          |
| Cloud      | AWS S3 + CloudFront (frontend) + AWS Lightsail (backend) | Low cost, disposable, HTTPS on custom domain |
| Repo       | GitHub (private, Gorilla org)                       | Monorepo structure                              |
| CI/CD      | GitHub Actions                                      | Triggered by DevOps Agent                       |

---

## 7. Repository Structure

```
solo-mode/
├── CLAUDE.md                  ← Global agent contract
├── brd.md                     ← This document (source of truth)
├── docs/
│   ├── .phase                 ← Current agent phase state (updated by each agent)
│   ├── design.md              ← Architect output (source of truth for developers)
│   └── brd-coverage.md        ← BRD requirement traceability (QA agent writes this)
├── .claude/
│   ├── agents/                ← Flat agent definitions (spawned by solo-mode skill)
│   │   ├── 01-architect-agent.md
│   │   ├── 02-developer-fe-agent.md
│   │   ├── 03-developer-be-agent.md
│   │   ├── 04-techlead-agent.md
│   │   ├── 06-devops-agent.md
│   │   └── 05-qa-agent.md
│   ├── agent-memory/          ← Shared context/state persisted between agents
│   └── skills/
│       └── solo-mode/
│           └── SKILL.md       ← /solo-mode → only user trigger, orchestrates all agents
├── apps/
│   ├── frontend/              ← React + Vite (Developer Agent FE)
│   │   ├── src/
│   │   │   ├── components/    ← shadcn/ui + custom components
│   │   │   ├── pages/         ← Dashboard, Candidate, Results
│   │   │   ├── lib/           ← API client, utils
│   │   │   └── tests/         ← Vitest unit tests
│   │   └── vite.config.ts
│   └── backend/               ← Node.js + Express (Developer Agent BE)
│       ├── src/
│       │   ├── routes/        ← Express route definitions
│       │   ├── controllers/   ← Business logic
│       │   ├── services/      ← Anthropic API, file parsing
│       │   ├── middleware/     ← Auth (implemented last), error handling
│       │   └── tests/         ← Integration tests
│       └── prisma/
│           └── schema.prisma  ← DB schema (source of truth for BE)
├── infrastructure/
│   └── terraform/             ← IaC definitions
└── .github/
    └── workflows/             ← CI/CD pipelines
```

---

## 8. State Management

The `solo-mode` skill writes a `.phase` file at `docs/.phase` after every agent completes.

**Format:**
```
epic=1,phase=2.0-complete
```

Valid phase values (same per each epic):

| Phase value | Meaning |
|-------------|---------|
| `epic=N,phase=1.0-running` / `epic=N,phase=1.0-complete` | Architect active / done — wrote `docs/design-epic-N.md` |
| `epic=N,phase=2.0-running` / `epic=N,phase=2.0-complete` | Developer BE active / done |
| `epic=N,phase=2.1-running` / `epic=N,phase=2.1-complete` | Developer FE active / done (parallel with 2.0) |
| `epic=N,phase=3.0-running` / `epic=N,phase=3.0-complete` | TechLead reviewing + fixing |
| `epic=N,phase=4.0-running` / `epic=N,phase=4.0-complete` | QA running E2E tests locally |
| `epic=6,phase=5.0-running` / `epic=6,phase=5.0-complete` | DevOps deploying (epic 6 only) |
| `ERROR` | Agent failed — file contains agent name + reason |

**Epic advancement:** When QA completes for epic N (N < 6), skill writes `epic=N+1,phase=1.0-running` and spawns the next Architect. When QA completes for epic 6, skill spawns DevOps.

---

## 9. Deliverables

| #    | Deliverable                                       | Owner           |
| ---- | ------------------------------------------------- | --------------- |
| D-01 | Solo Mode Framework (skills + agent definitions)  | Team            |
| D-02 | CLAUDE.md global contract                         | Team            |
| D-03 | Functional recruitment app (pre + post screening) | Framework       |
| D-04 | Live public deployment URL                        | DevOps Agent    |
| D-05 | Technical documentation (design.md, ADRs)         | Architect Agent |
| D-06 | Test results and QA report                        | QA Agent        |
| D-07 | Cost analysis and infrastructure teardown guide   | DevOps Agent    |
| D-08 | Demo presentation of the full workflow            | Team            |

---

## 10. Success Criteria

| #    | Criterion                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------- |
| S-01 | Framework executes from BRD to deployed app with zero human intervention after `/solo-mode` is triggered |
| S-02 | Recruitment app correctly analyzes CV + LinkedIn and generates interview questions                       |
| S-03 | Post-screening recommendation (Pass/No Pass) is coherent and explainable                                 |
| S-04 | Application is publicly accessible via URL after deployment                                              |
| S-05 | Infrastructure cost stays within free-tier or near-zero for MVP                                          |
| S-06 | Environment can be destroyed and recreated in under 10 minutes                                           |
| S-07 | All agents complete their phase without manual code edits                                                |
| S-08 | QA tests pass at ≥ 80% on first run                                                                      |

---

## 11. Constraints & Assumptions

- **Budget:** Free-tier cloud services during MVP; upgrade path defined but not activated
- **Auth:** JWT-based custom auth is implemented in **phase 2** — the recruiter login is the app entry point, not an afterthought
- **LLM:** Anthropic API (`claude-sonnet-4-6`) is the only LLM provider for this phase
- **Monorepo:** Single repo for MVP; multi-repo migration planned for post-MVP
- **Team:** Each member builds their own version of the framework; best one gets presented to leadership
- **Security:** All repos must be private; no Gorilla internal data in public GitHub
- **BRD Lifecycle:** The BRD is frozen after epic 1 starts — never edit existing requirements and never append new F-IDs. All new features, UI changes, and scope amendments go into `amendments.md` at the repo root. Agents read both files; the BRD is the signed baseline, `amendments.md` is the living delta. This makes the BRD safe to share across all team members without conflict.

---

_This BRD is the source of truth. All agents read this file. Any scope changes must be reflected here first before agent re-invocation._
