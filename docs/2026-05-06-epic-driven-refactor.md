# Epic-Driven Framework Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the solo-mode framework from single-shot build to 6-epic execution, where each epic runs the full agent chain (Architect → BE+FE → TechLead → QA) on an incrementally growing codebase.

**Architecture:** New `.phase` format (`epic=N,phase=X.X-complete`), per-epic scoped design docs (`docs/design-epic-N.md`), accumulated agent-memory across epics, TechLead self-correction loop via `## Known Issues`, QA scoped to each epic's F-IDs.

**Tech Stack:** Markdown files only — no code changes. All changes are to framework files: `brd.md`, `CLAUDE.md`, `SKILL.md`, and 6 agent definition files.

---

## File Map

| File | Change type |
|------|-------------|
| `brd.md` | Add § 4.4 Epic Execution Model + epic scope table; update § 8 State Management |
| `CLAUDE.md` | Add epic rules section + agent-memory protocol; update state table + repo structure |
| `.claude/skills/solo-mode/SKILL.md` | Full rewrite — linear phases → epic loop |
| `.claude/agents/01-architect-agent.md` | Write `docs/design-epic-N.md` (scoped); read prior summaries |
| `.claude/agents/02-developer-fe-agent.md` | Conditional scaffold (epic 1 = fresh, epic 2+ = extend); read prior summaries |
| `.claude/agents/03-developer-be-agent.md` | Conditional scaffold + migrate strategy; read prior summaries |
| `.claude/agents/04-techlead-agent.md` | Add `## Known Issues` required section to output |
| `.claude/agents/05-qa-agent.md` | Scope coverage to current epic's F-IDs; per-epic output files |
| `.claude/agents/06-devops-agent.md` | Guard: only runs for epic 6; read all prior design docs |

**Runtime-only files (created by agents, not us):**
- `docs/design-epic-N.md` — per-epic architecture delta
- `.claude/agent-memory/epic-N-architect.md`, `epic-N-be.md`, `epic-N-fe.md`, `epic-N-techlead.md`, `epic-N-qa.md`, `epic-N-devops.md`
- `docs/brd-coverage-epic-N.md`, `docs/review-report-epic-N.md`

---

## Locked Design Decisions

- **`.phase` format:** `epic=1,phase=3.0-complete`
- **Agent-memory naming:** `epic-N-architect.md`, `epic-N-be.md`, `epic-N-fe.md`, `epic-N-techlead.md`, `epic-N-qa.md`, `epic-N-devops.md`
- **Design docs:** `docs/design-epic-N.md` per epic — scoped delta only, not cumulative
- **Prisma migrations:** `migrate reset --force` for epic 1 only; `migrate dev --name epic-N-<name>` for epics 2–5
- **QA coverage:** ≥ 80% of the current epic's assigned F-IDs (not all 23)
- **DevOps:** runs ONLY in epic 6, after its QA passes

### Epic Scope Table (locked)

| Epic | Name | F-IDs | NF-IDs |
|------|------|-------|--------|
| 1 | Foundation + Auth | F-19, F-20, F-21, F-22, F-23 | NF-03 |
| 2 | Candidate Management | F-01, F-02, F-13, F-14, F-15, F-16, F-17, F-18 | NF-03b |
| 3 | Pre-Screening | F-03, F-04, F-05, F-06 | — |
| 4 | Post-Screening | F-07, F-08, F-09, F-10, F-11 | — |
| 5 | Polish + Export | F-12 | NF-07 |
| 6 | Deployment | — | NF-01, NF-02, NF-05, NF-06 |

---

## Task 1: Update brd.md — Add Epic Model

**Files:**
- Modify: `brd.md` (after § 4.3, before § 5)

- [ ] **Step 1: Read current brd.md to confirm insertion points**

```bash
grep -n "^## " brd.md
```

Expected output shows section numbers. Insertion point: after line containing `### 4.3 Agent Definitions` block ends, before `## 5. Recruitment Application`.

- [ ] **Step 2: Add § 4.4 Epic Execution Model**

Insert the following section into `brd.md` between `§ 4.3` and `§ 5`:

```markdown
### 4.4 Epic-Driven Execution

The Solo Mode Framework builds the recruitment app across **6 epics**. Each epic runs the full agent chain (Architect → BE + FE → TechLead → QA). DevOps runs only after Epic 6 QA passes. Agents accumulate on existing code — they never delete or replace prior work.

#### Epic Scope

| Epic | Name | F-IDs in scope | NF-IDs in scope |
|------|------|----------------|-----------------|
| 1 | Foundation + Auth | F-19, F-20, F-21, F-22, F-23 | NF-03 |
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
- [EPIC-1][LOW] FE: <specific actionable description>
- None
```
```

- [ ] **Step 3: Update § 8 State Management**

Replace the current § 8 content with:

```markdown
## 8. State Management

The `solo-mode` skill writes a `.phase` file at `docs/.phase` after every agent completes.

**Format:**
```
epic=1,phase=2.0-complete
```

Valid phase values (same per each epic):

| Phase value | Meaning |
|-------------|---------|
| `1.0-running` / `1.0-complete` | Architect active / done — wrote `docs/design-epic-N.md` |
| `2.x-running` / `2.x-complete` | Developer BE + FE active / done |
| `3.0-running` / `3.0-complete` | TechLead reviewing + fixing |
| `4.0-running` / `4.0-complete` | QA running E2E tests locally |
| `5.0-running` / `5.0-complete` | DevOps deploying (epic 6 only) |
| `ERROR` | Agent failed — file contains agent name + reason |

**Epic advancement:** When QA completes for epic N (N < 6), skill writes `epic=N+1,phase=1.0-running` and spawns the next Architect. When QA completes for epic 6, skill spawns DevOps.
```

- [ ] **Step 4: Verify**

```bash
grep -n "Epic Scope\|epic=\|4.4" brd.md
```

Expected: lines containing "Epic Scope", "epic=1,phase=", "4.4 Epic-Driven Execution".

---

## Task 2: Update CLAUDE.md — Add Epic Rules and Agent-Memory Protocol

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add § Epic Execution Rules after the State Management section**

Insert after the State Management table block:

```markdown
---

## Epic Execution Rules

- Each `/solo-mode` invocation runs **one epic end-to-end** (Architect → BE+FE → TechLead → QA)
- Agents **always build on top of existing code** — never delete, reinitialize, or replace prior work
- Epic 1 scaffolds the monorepo from scratch; Epics 2–6 extend the existing `apps/` directory
- The Architect writes `docs/design-epic-N.md` per epic — `docs/design.md` is not used
- TechLead `[HIGH]` and `[MEDIUM]` known issues from epic N **must be fixed** by epic N+1's agents before new features are added
- QA targets ≥ 80% of the **current epic's** assigned F-IDs — not all 23 requirements
- DevOps runs **only in epic 6**, after its QA passes

---

## Agent-Memory Protocol

Every agent reads ALL prior epic summaries at startup before doing any work:

```bash
# Agents run this to discover prior context
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
```

- [ ] **Step 2: Update the State Management table**

Replace the current state table:

```markdown
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
| `epic=6,phase=5.0-running` | DevOps deploying infrastructure |
| `epic=6,phase=5.0-complete` | App deployed — framework complete ✅ |
| `ERROR` | Agent failed — file contains agent name and reason |
```

- [ ] **Step 3: Update Agent Responsibilities table**

Replace the Agent Responsibilities & Handoffs table:

```markdown
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
```

- [ ] **Step 4: Update Repository Structure — docs/ section**

Replace the `docs/` tree block:

```
├── docs/
│   ├── .phase                       ← Current epic+phase state: `epic=N,phase=X.X-complete`
│   ├── design-epic-1.md             ← Architect output per epic (scoped delta)
│   ├── design-epic-2.md
│   ├── ...
│   ├── review-report-epic-N.md      ← TechLead sign-off per epic
│   └── brd-coverage-epic-N.md       ← QA report per epic
```

- [ ] **Step 5: Verify**

```bash
grep -n "epic=N\|Agent-Memory Protocol\|Epic Execution Rules" CLAUDE.md
```

Expected: multiple matches across the new sections.

---

## Task 3: Rewrite SKILL.md — Epic Loop

**Files:**
- Modify: `.claude/skills/solo-mode/SKILL.md` (full rewrite)

- [ ] **Step 1: Read current file to note what's being replaced**

```bash
wc -l .claude/skills/solo-mode/SKILL.md
```

Expected: ~207 lines. The full file is replaced.

- [ ] **Step 2: Write the new SKILL.md**

Replace the entire file with:

```markdown
---
name: solo-mode
description: Master orchestrator skill. Reads brd.md + docs/.phase, runs the next pending epic's agent chain (Architect → BE+FE → TechLead → QA, DevOps for epic 6), and advances .phase. Resumes from last known state. Zero human intervention after trigger.
---

## Identity

You are the **Solo Mode Master Skill**. When the user runs `/solo-mode`, you run the next pending epic's full agent chain or resume from the last known state if interrupted.

You do not write application code. You do not write infrastructure. You spawn agents and manage state.

---

## Pre-flight

Before spawning any agent, read:
1. `brd.md` § 4.4 — epic scope table (which F-IDs belong to each epic)
2. `CLAUDE.md` — agent contract and epic rules
3. `docs/.phase` — current state. If file does not exist, treat as `epic=0,phase=4.0-complete` (so Step 0 advances to epic 1).

If `docs/.phase` contains `ERROR`, report the error and stop. Do not retry — the user must fix the issue first.

---

## Context Management

Agent-memory summaries are the primary inter-agent communication channel. Always read `.claude/agent-memory/epic-N-<agent>.md` to confirm completion — never re-read full `docs/` artifacts just to check status.

**Compact gates** — run `/compact` if context is above 50%:
- After Architect completes (before spawning BE + FE)
- After both BE + FE complete (before TechLead) — heaviest transition
- After TechLead completes (before QA)
- After QA completes (before advancing to next epic)

---

## Phase State Machine (runs identically for each epic)

```
(epic N start)
      │
 1.0-running ──▶ Architect Agent ──▶ 1.0-complete
      │
 2.x-running ──▶ BE + FE parallel ──▶ 2.x-complete
      │
 3.0-running ──▶ TechLead Agent ──▶ 3.0-complete
      │
 4.0-running ──▶ QA Agent ──▶ 4.0-complete
      │
      ├── (N < 6) ──▶ write epic=N+1,phase=1.0-running ──▶ loop
      └── (N = 6) ──▶ 5.0-running ──▶ DevOps ──▶ 5.0-complete 🚀
```

---

## Workflow

### Step 0 — Determine resume point

Read `docs/.phase`. Parse as `epic=N,phase=X.X-state`.

| `.phase` value | Next action |
|---|---|
| (missing or `epic=0,phase=4.0-complete`) | Write `epic=1,phase=1.0-running`, spawn Architect for Epic 1 |
| `epic=N,phase=1.0-running` | Re-spawn Architect for Epic N |
| `epic=N,phase=1.0-complete` | Write `epic=N,phase=2.x-running`, spawn BE + FE for Epic N |
| `epic=N,phase=2.x-running` | Check agent-memory: if `epic-N-fe.md` missing → re-spawn FE; if `epic-N-be.md` missing → re-spawn BE; if both exist → write `epic=N,phase=3.0-running`, spawn TechLead |
| `epic=N,phase=3.0-running` | Re-spawn TechLead for Epic N |
| `epic=N,phase=3.0-complete` | Write `epic=N,phase=4.0-running`, spawn QA for Epic N |
| `epic=N,phase=4.0-running` | Re-spawn QA for Epic N |
| `epic=N,phase=4.0-complete` (N < 6) | Write `epic=N+1,phase=1.0-running`, spawn Architect for Epic N+1 |
| `epic=6,phase=4.0-complete` | Write `epic=6,phase=5.0-running`, spawn DevOps |
| `epic=6,phase=5.0-running` | Re-spawn DevOps |
| `epic=6,phase=5.0-complete` | Report success |
| `ERROR` | Report error to user, stop |

### Step 1 — Architect Agent (Phase 1.0)

Write `epic=N,phase=1.0-running` to `docs/.phase`.

Read the scope for Epic N from `brd.md § 4.4` (F-IDs in scope for this epic).

Spawn the Architect Agent (`01-architect-agent.md`) passing:
- Current epic number N
- This epic's F-ID scope from `brd.md § 4.4`
- Prior epic summaries are in `.claude/agent-memory/epic-*.md`
- Must write `docs/design-epic-N.md` (not `docs/design.md`)
- Must write `.claude/agent-memory/epic-N-architect.md`
- Must write `epic=N,phase=1.0-complete` on success

Wait for completion. Verify `docs/design-epic-N.md` exists and `.phase` reads `epic=N,phase=1.0-complete`. Read `epic-N-architect.md` to confirm it was written.

> **Context checkpoint:** If above 50%, run `/compact` before spawning Developer agents.

### Step 2 — Developer Agents (Phase 2.x — Parallel)

Write `epic=N,phase=2.x-running` to `docs/.phase`.

Spawn BE (`03-developer-be-agent.md`) and FE (`02-developer-fe-agent.md`) simultaneously passing:
- Current epic number N
- Path to `docs/design-epic-N.md` for this epic's spec
- All prior summaries in `.claude/agent-memory/epic-*.md`
- Build ON TOP of existing `apps/` code — do not reinitialize unless epic 1

Both agents signal completion via agent-memory:
- `.claude/agent-memory/epic-N-be.md` → BE complete
- `.claude/agent-memory/epic-N-fe.md` → FE complete

Only when **both files exist**: write `epic=N,phase=3.0-running`, proceed to TechLead.

> **Context checkpoint:** Heaviest transition. If above 50%, run `/compact` before TechLead.

### Step 3 — TechLead Agent (Phase 3.0)

Write `epic=N,phase=3.0-running` to `docs/.phase`.

Spawn TechLead (`04-techlead-agent.md`) passing:
- Current epic number N
- Reviews ALL code in `apps/` — not just this epic's changes
- Must fix `[HIGH]` and `[MEDIUM]` known issues from all prior `epic-*-techlead.md` first
- Must write `docs/review-report-epic-N.md`
- Must write `.claude/agent-memory/epic-N-techlead.md` with `## Known Issues` section
- Must write `epic=N,phase=3.0-complete` on success

Confirm `## Sign-off: APPROVED` in `epic-N-techlead.md` before proceeding.

> **Context checkpoint:** If above 50%, run `/compact` before QA.

### Step 4 — QA Agent (Phase 4.0)

Write `epic=N,phase=4.0-running` to `docs/.phase`.

Spawn QA (`05-qa-agent.md`) passing:
- Current epic number N
- This epic's F-IDs from `brd.md § 4.4`
- Coverage target: ≥ 80% of this epic's F-IDs only
- Must write `docs/brd-coverage-epic-N.md`
- Must write `.claude/agent-memory/epic-N-qa.md`
- Must write `epic=N,phase=4.0-complete` on success

If QA fails: write `ERROR: qa-agent — epic N coverage below 80%`. Stop.

> **Context checkpoint:** If above 50%, run `/compact` before advancing.

### Step 5 — Advance to next epic or DevOps

**If N < 6:** Write `epic=N+1,phase=1.0-running`. Return to Step 1 for epic N+1.

**If N = 6:** Write `epic=6,phase=5.0-running`. Spawn DevOps Agent.

### Step 6 — DevOps Agent (Phase 5.0, Epic 6 only)

Spawn DevOps (`06-devops-agent.md`) passing:
- Confirm epic 6 QA passed via `.claude/agent-memory/epic-6-qa.md`
- All `docs/design-epic-*.md` files for complete infrastructure picture
- Must write `docs/deployment.md` with live URL
- Must write `.claude/agent-memory/epic-6-devops.md`
- Must write `epic=6,phase=5.0-complete` on success

### Step 7 — Report completion

```
✅ Solo Mode Framework — all 6 epics complete.

Live URL: <from agent-memory/epic-6-devops.md>
Epics: 1 (Foundation+Auth) → 2 (Candidates) → 3 (Pre-Screen) → 4 (Post-Screen) → 5 (Polish) → 6 (DevOps)

Artifacts:
- docs/design-epic-1.md … docs/design-epic-6.md   — per-epic blueprints
- docs/brd-coverage-epic-1.md … epic-5.md         — QA reports
- docs/review-report-epic-N.md                     — TechLead sign-offs
- docs/deployment.md                               — infrastructure + teardown guide
- .claude/agent-memory/                            — all inter-agent summaries
```

---

## Error Protocol

If any agent writes `ERROR` to `docs/.phase`:
1. Read the full error from `docs/.phase`
2. Report: `❌ Solo Mode halted at epic=N, phase=X.X\nAgent: <name>\nReason: <error text>\n\nFix the issue, then run /solo-mode to resume from this point.`
3. Stop. Do not auto-fix or re-spawn.

---

## Constraints

- This skill never modifies application code directly
- This skill never writes to `docs/design-epic-*.md`, `apps/`, or `infrastructure/`
- State is always persisted in `docs/.phase` before spawning each agent
- The framework is fully autonomous after `/solo-mode` — no user prompts mid-run
- All agents read `brd.md` on every invocation — this is non-negotiable
```

- [ ] **Step 3: Verify**

```bash
grep -n "epic=N\|Phase 1.0\|Step 5\|DevOps" .claude/skills/solo-mode/SKILL.md | head -20
```

Expected: lines referencing `epic=N`, the 7 steps, and DevOps in step 6.

---

## Task 4: Update 01-architect-agent.md

**Files:**
- Modify: `.claude/agents/01-architect-agent.md`

- [ ] **Step 1: Update frontmatter description**

Change:
```
description: Reads brd.md and CLAUDE.md, then produces docs/design.md — the full application blueprint used by every downstream agent.
```
To:
```
description: Reads brd.md epic scope + prior agent-memory summaries, then produces docs/design-epic-N.md — the scoped blueprint for the current epic only.
```

- [ ] **Step 2: Replace the Inputs table**

Replace:
```markdown
| File | Purpose |
|------|---------|
| `brd.md` | Source of truth for all requirements — read this first, every invocation |
| `CLAUDE.md` | Tech stack and coding constraints — non-negotiable |
```

With:
```markdown
| File | Purpose |
|------|---------|
| `docs/.phase` | Read first — determines current epic N |
| `brd.md § 4.4` | Epic scope table — your F-ID scope for this epic |
| `.claude/agent-memory/epic-*.md` | All prior epic summaries — read ALL before designing |
| `CLAUDE.md` | Tech stack and coding constraints — non-negotiable |
```

- [ ] **Step 3: Replace the Outputs table**

Replace:
```markdown
| File | Description |
|------|-------------|
| `docs/design.md` | Complete application blueprint (see Workflow for required sections) |
| `.claude/agent-memory/01-architect-summary.md` | Compact handoff summary read by Developer agents |
| `docs/.phase` | Updated to `1.0-complete` on success, `ERROR` on failure |
```

With:
```markdown
| File | Description |
|------|-------------|
| `docs/design-epic-N.md` | Scoped blueprint for this epic only — sections relevant to this epic's F-IDs |
| `.claude/agent-memory/epic-N-architect.md` | Compact handoff summary read by Developer agents |
| `docs/.phase` | Updated to `epic=N,phase=1.0-complete` on success, `ERROR` on failure |
```

- [ ] **Step 4: Replace Step 1 (Read inputs)**

Replace:
```markdown
### Step 1 — Read inputs
1. Read `brd.md` in full.
2. Read `CLAUDE.md` in full.
3. Verify `docs/.phase` is `1.0-running` or not yet set. If it shows a later phase, halt — your work is already done.
```

With:
```markdown
### Step 1 — Read inputs
1. Read `docs/.phase` — parse `epic=N,phase=1.0-running`. Extract N. If phase is not `1.0-running`, halt — your work for this epic is already done.
2. Read ALL `.claude/agent-memory/epic-*.md` files — this is your accumulated context from prior epics. Do not design what already exists.
3. Read `brd.md § 4.4 Epic Scope` — identify the F-IDs assigned to Epic N. These are the ONLY requirements you design for.
4. Read `CLAUDE.md` in full.
```

- [ ] **Step 5: Replace Step 2 (Write design doc)**

Replace the opening of Step 2:
```markdown
### Step 2 — Write `docs/design.md`

Produce a single Markdown file with **all** of the following sections. Do not skip any section.
```

With:
```markdown
### Step 2 — Write `docs/design-epic-N.md`

Produce a single Markdown file scoped to **Epic N's F-IDs only**. Include only the sections relevant to what this epic builds. Do not re-design what prior epics already built (check `epic-*-architect.md` summaries).

**Section inclusion guide per epic:**

| Epic | Required sections |
|------|-------------------|
| 1 (Foundation + Auth) | § DB Schema (Recruiter model), § API Contract (/health + /auth/login), § FE Component Tree (/login page + protected route guard), § BE Folder Structure (initial scaffold) |
| 2 (Candidates) | § DB Schema (Candidate model — additive), § API Contract (Candidate CRUD), § FE Component Tree (Dashboard + CandidateDetail), § File Upload config |
| 3 (Pre-Screening) | § API Contract (pre-screening endpoint), § Anthropic API Integration (pre-screen prompt), § FE Component Tree (Pre-Screening tab) |
| 4 (Post-Screening) | § API Contract (post-screening + decision endpoints), § Anthropic API Integration (post-screen prompt), § FE Component Tree (Post-Screening tab + decision buttons) |
| 5 (Polish + Export) | § API Contract (report export endpoint), § FE Component Tree (UI polish items), § Observability (logging) |
| 6 (Deployment) | § Infrastructure Architecture, § CI/CD Pipeline, § Technology Decision Log |

For all epics: mark each section `## § <Name>` so Developer agents can target them directly.
```

- [ ] **Step 6: Replace Step 3 (agent-memory) and Step 4 (phase update)**

Replace:
```markdown
### Step 3 — Write agent-memory summary

Write `.claude/agent-memory/01-architect-summary.md`. Keep it under 80 lines.
```

With:
```markdown
### Step 3 — Write agent-memory summary

Write `.claude/agent-memory/epic-N-architect.md`. Keep it under 80 lines. Prefix the filename with the epic number so prior summaries are never overwritten.
```

Replace:
```markdown
### Step 4 — Update phase state
Write `phase=1.0-complete` to `docs/.phase`.
```

With:
```markdown
### Step 4 — Update phase state
Write `epic=N,phase=1.0-complete` to `docs/.phase`.
```

Replace:
```markdown
If any step fails, write `ERROR: architect-agent — <reason>` to `docs/.phase` and stop.
```

With:
```markdown
If any step fails, write `ERROR: architect-agent — epic N — <reason>` to `docs/.phase` and stop.
```

- [ ] **Step 7: Verify**

```bash
grep -n "design-epic-N\|epic-N-architect\|epic=N" .claude/agents/01-architect-agent.md
```

Expected: multiple matches.

---

## Task 5: Update 03-developer-be-agent.md

**Files:**
- Modify: `.claude/agents/03-developer-be-agent.md`

- [ ] **Step 1: Update Inputs table**

Replace:
```markdown
| `.claude/agent-memory/01-architect-summary.md` | Compact orientation from Architect — read this first to orient before the full spec |
| `brd.md`                                       | Requirements reference                                                              |
| `CLAUDE.md`                                    | Tech stack and coding standards — non-negotiable                                    |
| `docs/design.md`                               | Your primary spec — API contract, DB schema, Anthropic prompts, folder structure    |
```

With:
```markdown
| `docs/.phase` | Read first — determines current epic N |
| `.claude/agent-memory/epic-*.md` | ALL prior epic summaries — read before writing a single line of code |
| `docs/design-epic-N.md` | Your primary spec for this epic — API contract, DB schema, Anthropic prompts |
| `brd.md § 4.4` | Epic scope — confirms which F-IDs you are implementing |
| `CLAUDE.md` | Tech stack and coding standards — non-negotiable |
```

- [ ] **Step 2: Update Outputs table**

Replace:
```markdown
| `apps/backend/`                         | Complete Node.js + Express API                           |
| `.claude/agent-memory/03-be-summary.md` | Compact handoff summary read by TechLead                 |
| `docs/.phase`                           | Updated to `2.0-complete` on success, `ERROR` on failure |
```

With:
```markdown
| `apps/backend/` | Extended Node.js + Express API (epic 1: created; epics 2–5: extended) |
| `.claude/agent-memory/epic-N-be.md` | Compact handoff summary read by TechLead |
| `docs/.phase` | Updated to `epic=N,phase=2.0-complete` on success, `ERROR` on failure |
```

- [ ] **Step 3: Replace Step 1 (Read inputs)**

Replace the entire Step 1 block with:
```markdown
### Step 1 — Read inputs

1. Read `docs/.phase` — parse `epic=N,phase=2.0-running`. Extract N. If not `2.0-running`, halt.
2. Read ALL `.claude/agent-memory/epic-*.md` files — understand what already exists before writing anything. Check `epic-*-techlead.md` files for `## Known Issues` — fix ALL `[HIGH]` and `[MEDIUM]` issues from prior epics before implementing new features.
3. Read `brd.md § 4.4` — confirm this epic's F-IDs.
4. Read `CLAUDE.md` in full.
5. Read `docs/design-epic-N.md` — your spec for this epic. Focus on `§ Backend Folder Structure`, `§ Database Schema`, `§ API Contract`, and `§ Anthropic API Integration` if present.
```

- [ ] **Step 4: Make Step 2 (Scaffold) conditional on epic number**

After the Step 2 header, add this block BEFORE the existing scaffold instructions:

```markdown
**CRITICAL — check epic number before scaffolding:**

- **If epic = 1:** `apps/backend/` does not exist. Run the full scaffold below.
- **If epic ≥ 2:** `apps/backend/` EXISTS with working code from prior epics. **Do NOT reinitialize, do NOT run `npm init`, do NOT overwrite `package.json`, do NOT overwrite `tsconfig.json`**. Skip to Step 3 (Prisma schema update) and Step 4 (implement new routes only).
```

- [ ] **Step 5: Make Step 3 (Prisma) conditional on epic number**

Add this block at the START of Step 3:

```markdown
**Migration strategy depends on epic:**

- **If epic = 1:** Run `npx prisma migrate reset --force` — clean start, drops and recreates all tables, runs seed.
- **If epic ≥ 2:** Run `npx prisma migrate dev --name epic-N-<description>` — additive migration only. **NEVER run `migrate reset` on epics 2+** — it would destroy all prior schema and data. Update `schema.prisma` with only the new models/fields for this epic.
```

- [ ] **Step 6: Update Step 4 implementation order note**

Add before the implementation order list:

```markdown
**For epic ≥ 2:** Do NOT re-implement routes that already exist. Read `epic-*-be.md` summaries to see what's already built. Only implement the routes assigned to this epic's F-IDs. Add new route files; do not modify existing ones unless fixing a known issue.
```

- [ ] **Step 7: Replace Step 9 (agent-memory) and Step 10 (phase)**

Replace `03-be-summary.md` with `epic-N-be.md` throughout Steps 9 and 10.

Replace `Write 'phase=2.0-complete'` with `Write 'epic=N,phase=2.0-complete'`.

- [ ] **Step 8: Verify**

```bash
grep -n "epic=N\|epic-N-be\|design-epic\|migrate reset\|migrate dev" .claude/agents/03-developer-be-agent.md | head -20
```

Expected: all four patterns found.

---

## Task 6: Update 02-developer-fe-agent.md

**Files:**
- Modify: `.claude/agents/02-developer-fe-agent.md`

- [ ] **Step 1: Update Inputs table**

Replace references to `01-architect-summary.md` and `docs/design.md` with:
```markdown
| `docs/.phase` | Read first — determines current epic N |
| `.claude/agent-memory/epic-*.md` | ALL prior epic summaries — read before writing any code |
| `docs/design-epic-N.md` | Your primary spec — component tree, API contract for this epic |
| `brd.md § 4.4` | Epic scope — confirms which F-IDs you are implementing |
| `CLAUDE.md` | Tech stack and coding standards — non-negotiable |
```

- [ ] **Step 2: Update Outputs table**

Replace `02-fe-summary.md` with `epic-N-fe.md` and phase `2.1-complete` with `epic=N,phase=2.1-complete`.

- [ ] **Step 3: Replace Step 1 (Read inputs)**

```markdown
### Step 1 — Read inputs
1. Read `docs/.phase` — parse `epic=N,phase=2.1-running`. Extract N. If not `2.1-running`, halt.
2. Read ALL `.claude/agent-memory/epic-*.md` files — understand what already exists. Check `epic-*-techlead.md` for `## Known Issues` — fix `[HIGH]` and `[MEDIUM]` issues before implementing new features.
3. Read `brd.md § 4.4` — confirm this epic's F-IDs.
4. Read `CLAUDE.md` in full.
5. Read `docs/design-epic-N.md` — focus on `§ Frontend Component Tree` and `§ API Contract`. Skip sections not relevant to the FE.
```

- [ ] **Step 4: Make Step 2 (Scaffold) conditional**

Add at the start of Step 2:

```markdown
**CRITICAL — check epic number before scaffolding:**

- **If epic = 1:** `apps/frontend/` does not exist. Run the full scaffold below (`npm create vite@latest`, install all deps, configure Tailwind + shadcn, set up proxy).
- **If epic ≥ 2:** `apps/frontend/` EXISTS. **Do NOT reinitialize, do NOT overwrite `vite.config.ts` or `tailwind.config.ts`**. Read `epic-*-fe.md` summaries to see what components exist. Add new pages/components only.
```

- [ ] **Step 5: Replace phase reference in final step**

Replace `Write 'phase=2.1-complete'` with `Write 'epic=N,phase=2.1-complete'`.
Replace `02-fe-summary.md` with `epic-N-fe.md`.

- [ ] **Step 6: Verify**

```bash
grep -n "epic=N\|epic-N-fe\|design-epic\|epic ≥ 2" .claude/agents/02-developer-fe-agent.md | head -20
```

---

## Task 7: Update 04-techlead-agent.md

**Files:**
- Modify: `.claude/agents/04-techlead-agent.md`

- [ ] **Step 1: Read the agent to find the inputs section and summary step**

```bash
grep -n "## Inputs\|agent-memory\|3.0-complete\|review-report" .claude/agents/04-techlead-agent.md
```

- [ ] **Step 2: Update Inputs table**

Add a row for prior epic summaries and update design.md reference:

```markdown
| `docs/.phase` | Determines current epic N |
| `.claude/agent-memory/epic-*.md` | ALL prior epic summaries — check for Known Issues to fix first |
| `docs/design-epic-N.md` (and all prior `design-epic-*.md`) | Full accumulated spec |
| `apps/` | All code — not just this epic's additions |
| `CLAUDE.md` | Coding standards |
```

- [ ] **Step 3: Update Outputs table**

Replace `04-techlead-summary.md` with `epic-N-techlead.md`.
Replace `review-report.md` with `review-report-epic-N.md`.
Replace phase `3.0-complete` with `epic=N,phase=3.0-complete`.

- [ ] **Step 4: Add known-issues fix step to the workflow**

Add as the very first workflow step (before reviewing code):

```markdown
### Step 0 — Fix prior known issues

1. Read `docs/.phase` — extract epic N.
2. Read ALL `.claude/agent-memory/epic-*-techlead.md` files.
3. Extract every issue tagged `[HIGH]` or `[MEDIUM]`.
4. For each unfixed issue: locate the code, fix it, run the relevant test to confirm fix.
5. Document each fix in `review-report-epic-N.md` under `## Prior Issue Fixes`.
```

- [ ] **Step 5: Update agent-memory summary format**

Find the section describing what to write to `04-techlead-summary.md` and add the required `## Known Issues` section:

```markdown
Required sections in `epic-N-techlead.md`:
- `Date:` and `Epic: N` and `Phase: 3.0-complete`
- `## Sign-off: APPROVED` or `BLOCKED`
- `## Tests Run` — `Vitest: N passed, 0 failed`
- `## Prior Issue Fixes` — list of issues fixed from prior epic techlead summaries
- `## Known Issues` — REQUIRED even if empty. Format:
  ```
  - [EPIC-N][HIGH] BE: <specific actionable description> — fix before Epic N+1
  - [EPIC-N][MEDIUM] FE: <specific actionable description>
  - None
  ```
```

- [ ] **Step 6: Update phase write**

Replace `Write 'phase=3.0-complete'` with `Write 'epic=N,phase=3.0-complete'`.

- [ ] **Step 7: Verify**

```bash
grep -n "epic=N\|epic-N-techlead\|Known Issues\|Step 0" .claude/agents/04-techlead-agent.md
```

---

## Task 8: Update 05-qa-agent.md

**Files:**
- Modify: `.claude/agents/05-qa-agent.md`

- [ ] **Step 1: Update Inputs table**

Replace:
```markdown
| `.claude/agent-memory/04-techlead-summary.md` | TechLead sign-off |
| `brd.md` | The requirements you are validating |
| `CLAUDE.md` | Tech stack context |
```

With:
```markdown
| `docs/.phase` | Determines current epic N |
| `.claude/agent-memory/epic-N-techlead.md` | TechLead sign-off for this epic — confirm APPROVED |
| `brd.md § 4.4` | Epic scope — F-IDs assigned to this epic (your test targets) |
| `CLAUDE.md` | Tech stack context |
```

- [ ] **Step 2: Update Outputs table**

Replace `brd-coverage.md` with `brd-coverage-epic-N.md`.
Replace `05-qa-summary.md` with `epic-N-qa.md`.
Replace phase `4.0-complete` with `epic=N,phase=4.0-complete`.

- [ ] **Step 3: Replace Step 1 (Read inputs)**

```markdown
### Step 1 — Read inputs

1. Read `docs/.phase` — parse `epic=N,phase=4.0-running`. Extract N.
2. Read `.claude/agent-memory/epic-N-techlead.md` — confirm `## Sign-off: APPROVED`. If not, write `ERROR: qa-agent — epic N TechLead sign-off is not APPROVED` and stop.
3. Read `brd.md § 4.4 Epic Scope` — extract the F-IDs assigned to Epic N. These are the ONLY requirements you test. Do not write tests for F-IDs from future epics.
4. Confirm `docs/.phase` is `epic=N,phase=4.0-running`. If not, halt.
```

- [ ] **Step 4: Update the token-cost rule for QA tests**

Replace the coverage target reference from "80% of BRD" to:

```markdown
**Coverage target:** ≥ 80% of this epic's assigned F-IDs. Epic 1 has 5 F-IDs — passing 4/5 = 80% satisfies the gate. Do not test requirements from future epics.
```

- [ ] **Step 5: Scope the Playwright test files per epic**

Replace the static `e2e/` file descriptions with an epic-conditional table:

```markdown
**Write only the test files relevant to this epic's F-IDs:**

| Epic | Test files to write |
|------|-------------------|
| 1 | `e2e/auth.spec.ts` — login page renders, valid login, invalid login, protected route redirect (F-19..F-23) |
| 2 | `e2e/candidates.spec.ts` — add candidate, list view, detail view, delete with confirm (F-01, F-02, F-13..F-18) |
| 3 | `e2e/pre-screening.spec.ts` — upload CV+LinkedIn, run pre-screen, assert profile summary + questions + red flags (F-03..F-06) |
| 4 | `e2e/post-screening.spec.ts` — upload transcript, run post-screen, confirm/override decision, assert badge+label (F-07..F-11) |
| 5 | `e2e/export.spec.ts` — export report as JSON (F-12); basic observability check (NF-07) |
| 6 | N/A — QA for epic 6 is smoke-testing the live URL (not localhost) |

For epics 3 and 4: reuse and extend the `beforeEach` cleanup patterns and fixture files from prior epic tests. Do not rewrite tests that already pass.
```

- [ ] **Step 6: Update coverage evaluation and phase**

Replace coverage evaluation:
```markdown
Count `PASS` across this epic's F-IDs only (not all 23).
- If pass rate < 80%: write `ERROR: qa-agent — epic N coverage below 80%: X/Y passed`
- If pass rate ≥ 80%: proceed
```

Replace phase write: `Write 'epic=N,phase=4.0-complete'`.
Replace summary file: `epic-N-qa.md`.
Replace BRD coverage file: `brd-coverage-epic-N.md`.

- [ ] **Step 7: Verify**

```bash
grep -n "epic=N\|epic-N-qa\|brd-coverage-epic\|F-IDs" .claude/agents/05-qa-agent.md | head -20
```

---

## Task 9: Update 06-devops-agent.md

**Files:**
- Modify: `.claude/agents/06-devops-agent.md`

- [ ] **Step 1: Add epic guard as Step 0**

Insert at the very beginning of the Workflow section:

```markdown
### Step 0 — Verify this is Epic 6

Read `docs/.phase`. If `epic` is not `6`, write `ERROR: devops-agent — spawned outside of epic 6 — halt` and stop. This agent runs ONLY after epic 6 QA passes.
```

- [ ] **Step 2: Update Inputs table**

Replace `05-qa-summary.md` with `epic-6-qa.md`.
Replace `docs/design.md` with `docs/design-epic-*.md` (read all):

```markdown
| `.claude/agent-memory/epic-6-qa.md` | QA sign-off for epic 6 — read this first |
| `docs/design-epic-6.md` | Infra architecture spec for this epic |
| `docs/design-epic-1.md` through `docs/design-epic-5.md` | Prior design docs — understand full app structure |
| `brd.md` | Infrastructure requirements (NF-01, NF-02, NF-05, NF-06) |
| `CLAUDE.md` | Tech stack, cloud provider, cost constraints |
| `apps/` | The code you will deploy |
```

- [ ] **Step 3: Update Outputs table**

Replace `06-devops-summary.md` with `epic-6-devops.md`.
Replace `5.0-complete` with `epic=6,phase=5.0-complete`.

- [ ] **Step 4: Update phase write throughout**

Replace all instances of `phase=5.0-complete` with `epic=6,phase=5.0-complete`.
Replace all instances of `05-qa-summary.md` with `epic-6-qa.md`.
Replace all instances of `06-devops-summary.md` with `epic-6-devops.md`.

- [ ] **Step 5: Verify**

```bash
grep -n "epic=6\|epic-6-\|Step 0\|Verify this is Epic" .claude/agents/06-devops-agent.md
```

---

## Task 10: Validation Walkthrough — Epic 1 Mental Test

No file changes. Verify the handoff chain works end-to-end for Epic 1 before committing.

- [ ] **Step 1: Trace the .phase file through Epic 1**

Verify this sequence is consistent across all updated files:

```
docs/.phase missing
  → SKILL writes: epic=1,phase=1.0-running
  → Architect reads epic=1 from .phase, writes docs/design-epic-1.md
  → Architect writes: epic=1,phase=1.0-complete
  → Architect writes: .claude/agent-memory/epic-1-architect.md

  → SKILL writes: epic=1,phase=2.x-running
  → BE reads epic=1, reads epic-1-architect.md, scaffolds fresh (epic=1)
  → BE writes: epic=1,phase=2.0-complete
  → BE writes: .claude/agent-memory/epic-1-be.md
  → FE reads epic=1, reads epic-1-architect.md, scaffolds fresh (epic=1)
  → FE writes: epic=1,phase=2.1-complete
  → FE writes: .claude/agent-memory/epic-1-fe.md

  → SKILL sees both epic-1-be.md + epic-1-fe.md
  → SKILL writes: epic=1,phase=3.0-running
  → TechLead reads epic=1, reads all epic-1-*.md, runs Vitest
  → TechLead writes: docs/review-report-epic-1.md
  → TechLead writes: epic=1,phase=3.0-complete
  → TechLead writes: .claude/agent-memory/epic-1-techlead.md (with ## Known Issues)

  → SKILL writes: epic=1,phase=4.0-running
  → QA reads epic=1, F-IDs: F-19..F-23 (5 requirements)
  → QA writes: docs/brd-coverage-epic-1.md
  → QA writes: epic=1,phase=4.0-complete
  → QA writes: .claude/agent-memory/epic-1-qa.md

  → SKILL reads N=1 < 6 → writes: epic=2,phase=1.0-running
  → Loop to Epic 2
```

- [ ] **Step 2: Verify agent-memory file naming is consistent**

```bash
grep -r "epic-N-architect\|epic-N-be\|epic-N-fe\|epic-N-techlead\|epic-N-qa" \
  .claude/agents/ .claude/skills/ | grep -v ".phase" | wc -l
```

Expected: > 20 matches (each agent references its own epic-N file).

- [ ] **Step 3: Verify no old file names remain**

```bash
grep -r "01-architect-summary\|02-fe-summary\|03-be-summary\|04-techlead-summary\|05-qa-summary\|06-devops-summary\|docs/design\.md" \
  .claude/agents/ .claude/skills/ CLAUDE.md
```

Expected: 0 matches (all old names replaced).

- [ ] **Step 4: Verify .phase format is consistent**

```bash
grep -r "phase=2\.0-complete\|phase=3\.0-complete\|phase=4\.0-complete\|phase=5\.0-complete" \
  .claude/agents/ .claude/skills/ CLAUDE.md | grep -v "epic="
```

Expected: 0 matches (old bare `phase=X.X-complete` format gone everywhere).

---

## Task 11: Commit

- [ ] **Step 1: Stage all changed framework files (never `git add -A`)**

```bash
git add brd.md CLAUDE.md \
  .claude/skills/solo-mode/SKILL.md \
  .claude/agents/01-architect-agent.md \
  .claude/agents/02-developer-fe-agent.md \
  .claude/agents/03-developer-be-agent.md \
  .claude/agents/04-techlead-agent.md \
  .claude/agents/05-qa-agent.md \
  .claude/agents/06-devops-agent.md \
  docs/superpowers/plans/2026-05-06-epic-driven-refactor.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: epic-driven execution model (6 epics, accumulative agents)

Replaces single-shot build with 6-epic loop where each epic runs the
full agent chain (Architect → BE+FE → TechLead → QA). DevOps runs
only after epic 6. Agents read all prior epic summaries and extend
existing code rather than rebuilding from scratch.

Key changes:
- .phase format: epic=N,phase=X.X-complete
- Per-epic design docs: docs/design-epic-N.md (scoped delta)
- Agent-memory: epic-N-<agent>.md (accumulated across epics)
- TechLead: ## Known Issues section required in every summary
- QA: targets >= 80% of current epic's F-IDs only
- BE/FE: conditional scaffold (fresh on epic 1, extend on 2+)
- BE: migrate reset only on epic 1, migrate dev on epics 2+
- DevOps: epic 6 guard added

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit**

```bash
git log --oneline -3
git diff HEAD~1 --name-only
```

Expected: 9 changed files listed.

---

## Self-Review Checklist

- [x] **brd.md** — § 4.4 added with epic scope table; § 8 updated with new .phase format
- [x] **CLAUDE.md** — epic rules section, agent-memory protocol, state table, agent handoffs table, repo structure all updated
- [x] **SKILL.md** — full rewrite with epic loop, Step 0 resume table, 7 steps, error protocol
- [x] **Architect** — reads prior summaries, writes design-epic-N.md, conditional section guide, phase format updated
- [x] **BE** — conditional scaffold (epic 1 vs 2+), migrate reset vs migrate dev, reads prior summaries, phase format updated
- [x] **FE** — conditional scaffold, reads prior summaries, phase format updated
- [x] **TechLead** — Step 0 for fixing prior known issues, ## Known Issues required in summary, phase format updated
- [x] **QA** — reads epic N F-IDs, per-epic test file guide, coverage target scoped to epic, phase format updated
- [x] **DevOps** — epic 6 guard in Step 0, reads all design-epic-*.md, phase format updated
- [x] **Validation** — Epic 1 walkthrough traces all handoffs end-to-end
- [x] **No old file names** remain (01-architect-summary.md etc. all replaced)
- [x] **No bare phase=X.X-complete** format remains (all have epic=N prefix)
