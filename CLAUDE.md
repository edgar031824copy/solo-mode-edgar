# CLAUDE.md

## Project Overview

This repository has two layers:

1. **Solo Mode Framework** — a set of Claude Code skills and agent definitions that autonomously execute the full SDLC given a BRD
2. **Recruitment Application** — the demo product built _by_ the framework to prove it works end-to-end

The source of truth for all requirements is `brd.md`. All agents must read it on every invocation. Scope changes go to `brd.md` first; no agent acts on verbal instructions that contradict it.

---

## Tech Stack (non-negotiable)

| Layer      | Technology                                                         |
| ---------- | ------------------------------------------------------------------ |
| Frontend   | React + Vite                                                       |
| UI Library | Tailwind CSS + shadcn/ui                                           |
| Backend    | Node.js + Express                                                  |
| ORM        | Prisma                                                             |
| Database   | PostgreSQL (local) / Supabase (cloud, free tier)                   |
| AI/LLM     | Anthropic Claude API — model: `claude-sonnet-4-6`                  |
| Auth       | JWT + custom middleware (**implemented in phase 2 — part of the core build**) |
| Testing    | Playwright (E2E) + Vitest (unit)                                   |
| IaC        | Terraform                                                          |
| Cloud      | AWS S3 + CloudFront (frontend) + AWS Lightsail (backend) + Supabase (database) |
| Process    | PM2 (keeps Node.js alive on Lightsail — no Docker)                 |
| CI/CD      | GitHub Actions                                                     |

Do not introduce alternative libraries or frameworks without updating `brd.md` first.

---

## Repository Structure

```
solo-mode/
├── CLAUDE.md                        ← This file — global agent contract
├── brd.md                           ← Source of truth for all requirements
├── docs/
│   ├── .phase                       ← Current epic+phase state: `epic=N,phase=X.X-complete`
│   ├── design-epic-1.md             ← Architect output per epic (scoped delta)
│   ├── design-epic-2.md
│   ├── ...
│   ├── review-report-epic-N.md      ← TechLead sign-off per epic
│   └── brd-coverage-epic-N.md       ← QA report per epic
├── .claude/
│   ├── agents/                      ← Flat agent definitions (spawned by /solo-mode skill)
│   │   ├── 01-architect-agent.md
│   │   ├── 02-developer-fe-agent.md
│   │   ├── 03-developer-be-agent.md
│   │   ├── 04-techlead-agent.md
│   │   ├── 05-qa-agent.md
│   │   └── 06-devops-agent.md
│   ├── agent-memory/                ← Shared context persisted between agents
│   └── skills/
│       ├── solo-mode/
│       │   └── SKILL.md             ← /solo-mode skill — only user-facing trigger
│       └── open-pr/
│           └── SKILL.md             ← /open-pr skill — commit, push, and open GitHub PR
├── apps/
│   ├── frontend/                    ← React + Vite (Developer FE Agent)
│   │   └── src/
│   │       ├── components/          ← shadcn/ui + custom components
│   │       ├── pages/               ← Dashboard, Candidate, Results
│   │       ├── lib/                 ← API client, utils
│   │       └── tests/               ← Vitest unit tests
│   └── backend/                     ← Node.js + Express (Developer BE Agent)
│       ├── src/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── services/            ← Anthropic API integration, file parsing
│       │   ├── middleware/          ← Auth (JWT, phase 2), error handling
│       │   └── tests/               ← Integration tests
│       └── prisma/
│           └── schema.prisma        ← DB schema — source of truth for BE
├── infrastructure/
│   └── terraform/
└── .github/
    └── workflows/
```

---

## State Management

Agents communicate progress via `docs/.phase`. Every agent reads the current phase on start and writes its new phase on completion.

**Format:** `epic=N,phase=X.X-complete`

| State | Meaning |
|-------|---------|
| `epic=N,phase=1.0-running` | Architect generating `docs/design-epic-N.md` |
| `epic=N,phase=1.0-complete` | Design doc written — Developer agents can start |
| `epic=N,phase=2.0-running` | Developer BE active |
| `epic=N,phase=2.0-complete` | BE code written |
| `epic=N,phase=2.1-running` | Developer FE active (parallel with BE) |
| `epic=N,phase=2.1-complete` | FE code written |
| `epic=N,phase=3.0-running` | TechLead reviewing + running tests |
| `epic=N,phase=3.0-complete` | Code approved — QA can start |
| `epic=N,phase=4.0-running` | QA running E2E tests locally |
| `epic=N,phase=4.0-complete` | QA passed — advance to epic N+1 (or DevOps if epic 6) |
| `epic=6,phase=5.0-running` | DevOps deploying infrastructure (full Terraform) |
| `epic=6,phase=5.0-complete` | App deployed — framework complete ✅ |
| `epic=N,phase=5.0-running` (N ≥ 7) | DevOps post-launch: push + CI/CD verify only |
| `epic=N,phase=5.0-complete` (N ≥ 7) | Post-launch deploy verified — check for next amendments |
| `ERROR` | Agent failed — file contains agent name and reason |

On failure: write `ERROR` to `.phase` with the failing agent name and reason, then stop cleanly. Do not continue to the next phase.

---

## BRD Lifecycle and Design Contract

### BRD — Frozen After Epic 1 Starts
The BRD is the signed baseline. Once solo-mode execution begins it is never modified:
- **Never edit existing F-IDs** — agents have already read and acted on them
- **Never append new F-IDs to the BRD** — all changes go through `amendments.md`
- This makes the BRD safe to share across all team members without merge conflicts

### amendments.md — The Living Change Channel
`amendments.md` lives at the repo root alongside `brd.md`. It is the only place product scope changes after epic 1:
- Add new F-IDs here (e.g. F-24) with a description and target epic
- Record UI changes, behavior tweaks, and scope adjustments
- Agents read it if it exists — if missing, they proceed with BRD scope only
- In Team Mode: each developer maintains their own amendments, merged before each run

Required format when file exists:
```markdown
## Amendments

| ID   | Description | Target Epic | Status |
|------|-------------|-------------|--------|
| F-24 | Recruiter can edit candidate notes inline | 2 | pending |
| F-25 | Export report as PDF in addition to JSON | 5 | pending |
```

### design-epic-N.md — Protected Amendable Contract
The Architect writes `docs/design-epic-N.md` once per epic. It is the definitive technical contract for that epic:
- All Developer, TechLead, and QA agents consume it as their primary spec
- If a requirement must change mid-epic, amend the design doc first, then re-run the affected agent
- The Architect never regenerates it from scratch mid-epic — only appends or amends specific sections
- In Team Mode, `design-epic-N.md` is the integration boundary: other solo-mode instances read it to understand what this epic exposed

### Agent-Memory Standard Header
Every agent-memory file MUST begin with a YAML frontmatter block. This makes outputs machine-parseable by an integration pipeline across multiple solo-mode instances:

```yaml
---
epic: N
agent: architect | be | fe | techlead | qa | devops
status: complete | error
phase: 1.0-complete | 2.0-complete | 2.1-complete | 3.0-complete | 4.0-complete | 5.0-complete
outputs: [primary output files written by this agent]
---
```

Example for BE agent completing epic 2:
```yaml
---
epic: 2
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/routes/candidates.ts, prisma/migrations/20260508_epic2_candidates]
---
```

---

## Epic Execution Rules

- Each `/solo-mode` invocation runs **one epic end-to-end** (Architect → BE+FE → TechLead → QA)
- Agents **always build on top of existing code** — never delete, reinitialize, or replace prior work
- Epic 1 scaffolds the monorepo from scratch; Epics 2–6 extend the existing `apps/` directory
- The Architect writes `docs/design-epic-N.md` per epic — `docs/design.md` is not used
- **Developer BE and FE agents** must fix all `[HIGH]` and `[MEDIUM]` known issues from prior TechLead summaries (`epic-*-techlead.md`) before writing any new feature code in the current epic
- QA targets ≥ 80% of the **current epic's** assigned F-IDs — not all 23 requirements
- DevOps runs **only in epic 6**, after its QA passes

---

## Agent-Memory Protocol

Every agent reads ALL prior epic summaries at startup before doing any work:

```bash
ls .claude/agent-memory/epic-*.md
```

Every agent writes its own compact summary on completion (under 60 lines):

| Agent | File written |
|-------|-------------|
| Architect | `.claude/agent-memory/epic-N-architect.md` |
| Developer BE | `.claude/agent-memory/epic-N-be.md` |
| Developer FE | `.claude/agent-memory/epic-N-fe.md` |
| TechLead | `.claude/agent-memory/epic-N-techlead.md` |
| QA | `.claude/agent-memory/epic-N-qa.md` |
| DevOps | `.claude/agent-memory/epic-N-devops.md` |

TechLead summaries **must** include a `## Known Issues` section (write `None` if clean).

---

## Agent Responsibilities & Handoffs

| Agent | File | Input | Output |
|-------|------|-------|--------|
| Master Skill | `SKILL.md` | `brd.md` + `docs/.phase` | Runs epic loop; spawns agents; never touches code |
| Architect | `01-architect-agent.md` | `brd.md § 4.4 epic scope` + prior `epic-*.md` summaries | `docs/design-epic-N.md` — delta for this epic only |
| Developer FE | `02-developer-fe-agent.md` | `docs/design-epic-N.md` + all prior summaries | Extends `apps/frontend/` — never reinitializes |
| Developer BE | `03-developer-be-agent.md` | `docs/design-epic-N.md` + all prior summaries | Extends `apps/backend/` — never reinitializes |
| TechLead | `04-techlead-agent.md` | All `apps/` code + all design docs | Fixes blockers; writes `## Known Issues` to `epic-N-techlead.md` |
| QA | `05-qa-agent.md` | localhost app + this epic's F-IDs from `brd.md § 4.4` | `docs/brd-coverage-epic-N.md`; ≥ 80% of epic's F-IDs |
| DevOps | `06-devops-agent.md` | Epic 6 QA sign-off + all `design-epic-*.md` | Live URL; Terraform; GitHub Actions; runs epic 6 only |

---

## Coding Standards

- **Test-first:** Write a failing test before writing implementation code (both FE and BE)
- **Auth in phase 2:** JWT middleware is implemented as part of the core build — all routes protected, login page included
- **DB schema is canonical:** `prisma/schema.prisma` is the single source of truth for the data model; never write raw SQL migrations by hand
- **API contract from `docs/design-epic-N.md`:** Frontend and backend must conform to the endpoint shapes documented by the Architect for the current epic — changes require updating the current epic's design doc first
- **Comments:** Inline comments on non-obvious logic only; agents write them to preserve context for the TechLead Agent

---

## Security Rules

- Repository must remain **private** — no Gorilla internal data or candidate PII in any public GitHub repo
- No API keys or secrets committed to the repo; use environment variables
- Candidate PII must not be stored beyond the session unless explicitly persisted by design
- Auth (JWT) is implemented in phase 2 — `POST /auth/login` + middleware protecting all routes except `/health`

---

## Infrastructure Constraints

- **Fixed deployment stack — do not substitute:**
  - Frontend: AWS S3 (static files) + CloudFront (HTTPS termination, custom domain, edge caching) + ACM certificate — CloudFront is required; S3 alone cannot serve HTTPS on a custom domain
  - Backend API: AWS Lightsail instance ($3.50/mo), Node.js managed by PM2
  - Database: Supabase free tier (PostgreSQL) — same connection string in local dev and production
  - No Docker, no Lambda, no Lightsail Managed Database
- All infrastructure defined as Terraform — no manual AWS console provisioning
- Environments must be fully destroyable with `terraform destroy` in under 10 minutes
- **Lightsail user_data bootstrap must use `#!/bin/bash`** — Ubuntu 22.04 runs cloud-init scripts with `/bin/sh` (dash) by default; `set -euo pipefail` is bash-only and will silently abort the script mid-run, leaving Node.js installed but PM2 never started
- **GitHub Actions auth — OIDC only, never static AWS keys:**
  - `deploy-frontend` in `deploy.yml` must use `aws-actions/configure-aws-credentials@v4` with `role-to-assume: arn:aws:iam::995603457880:role/gha-aisdlc-deploy-role` and `permissions: id-token: write` + `contents: read` at the job level
  - Never store `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as GitHub secrets — replaced permanently by OIDC
- **Terraform remote state:** All state lives in S3 bucket `gorilla-tf-state-995603457880`, key `solo-mode/terraform.tfstate`, region `us-east-1`. Always add a `backend "s3"` block to `infrastructure/terraform/main.tf`. Run `terraform init -reconfigure` to initialize fresh — do NOT migrate local tfstate (it contains personal account resource IDs that are meaningless in the company account).
- **Terraform must run via GitHub Actions, never locally against the company account** (audit trail requirement from company DevOps):
  - Provision: `terraform-provision.yml` — `workflow_dispatch`, `runs-on: ubuntu-latest`, OIDC auth, accepts `runner_registration_token` as a workflow input
  - Destroy: `terraform-destroy.yml` — `workflow_dispatch` with a required `confirm` string input; a shell step must exit 1 if the value is not exactly `"destroy"`
- **Self-hosted runner bootstrapped in Lightsail user_data:** After the PM2 startup block, add: download the latest actions-runner binary, extract to `/home/ubuntu/actions-runner`, `chown -R ubuntu:ubuntu /home/ubuntu/actions-runner`, run `./config.sh --url https://github.com/<repo> --token <runner_registration_token var> --name lightsail-runner --labels self-hosted --unattended` as ubuntu user, then `./svc.sh install ubuntu && ./svc.sh start`. Runner registration token is valid 1 hour — generate it immediately before triggering `terraform-provision.yml`. Detect the current repo name automatically: `gh repo view --json nameWithOwner -q .nameWithOwner`.
