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
4. `amendments.md` (optional) — if it exists at the repo root, read it. Extract any rows where `Target Epic = N` and `Status = pending`. These are additional F-IDs to pass to the Architect alongside the BRD scope.

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
      ├── (N = 6) ──▶ 5.0-running ──▶ DevOps (full Terraform) ──▶ 5.0-complete 🚀
      └── (N ≥ 7) ──▶ 5.0-running ──▶ DevOps (post-launch: git push + CI/CD) ──▶ 5.0-complete
                                                │
                             amendments pending ──▶ write epic=N+1,phase=1.0-running ──▶ loop 🔄
                             no amendments     ──▶ idle 🏁
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
| `epic=6,phase=4.0-complete` | Write `epic=6,phase=5.0-running`, spawn DevOps (full Terraform mode) |
| `epic=N,phase=4.0-complete` (N ≥ 7) | Write `epic=N,phase=5.0-running`, spawn DevOps (post-launch mode — git push + CI/CD only) |
| `epic=N,phase=5.0-running` (N ≥ 6) | Re-spawn DevOps for Epic N |
| `epic=N,phase=5.0-complete` (N ≥ 6) | Mark amendments targeting N as done; check for pending amendments targeting N+1. If found: write `epic=N+1,phase=1.0-running`. If none: report idle. |
| `ERROR` | Report error to user, stop |

### Step 1 — Architect Agent (Phase 1.0)

Write `epic=N,phase=1.0-running` to `docs/.phase`.

Read the scope for Epic N from `brd.md § 4.4` (F-IDs in scope for this epic).

Spawn the Architect Agent (`01-architect-agent.md`) passing:
- Current epic number N
- This epic's F-ID scope from `brd.md § 4.4`
- Any amendments targeting Epic N from `amendments.md` (if file exists and has matching rows)
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

### Step 5 — Advance to next epic or deploy

**If N < 6:** Write `epic=N+1,phase=1.0-running`. Return to Step 1 for epic N+1.

**If N = 6:** Write `epic=6,phase=5.0-running`. Spawn DevOps Agent (full Terraform mode — provisions all infrastructure from scratch).

**If N ≥ 7:** Write `epic=N,phase=5.0-running`. Spawn DevOps Agent (post-launch mode — infrastructure already exists from epic 6; agent only commits + pushes to main and verifies CI/CD deployed successfully).

### Step 6 — DevOps Agent (Phase 5.0)

Spawn DevOps (`06-devops-agent.md`) passing:
- Current epic N
- QA sign-off: `.claude/agent-memory/epic-N-qa.md`
- All `docs/design-epic-*.md` files for complete picture

**Epic 6 (full Terraform mode):**
- Must write `docs/deployment.md` with live URL
- Must write `.claude/agent-memory/epic-6-devops.md`
- Must write `epic=6,phase=5.0-complete` on success

**Epic ≥ 7 (post-launch mode):**
- Infrastructure already exists — no Terraform provisioning
- Must commit + push new code to main, verify CI/CD completes, confirm live URL still responds
- Must write `.claude/agent-memory/epic-N-devops.md`
- Must write `epic=N,phase=5.0-complete` on success

### Step 7 — Feature cycle check

After DevOps writes `epic=N,phase=5.0-complete` (any N ≥ 6):

1. Read `amendments.md`. Update all rows with `Target Epic = N` and `Status = pending` → `Status = done`.
2. Find all rows with `Target Epic = N+1` and `Status = pending`.
3. **If pending amendments exist for N+1:**
   - Write `epic=N+1,phase=1.0-running` to `docs/.phase`
   - Report: `🔄 Feature cycle starting — Epic N+1 queued with <count> pending amendments`
   - Return to Step 1 — Architect for Epic N+1 uses those amendments as sole scope
4. **If no pending amendments:**
   - Proceed to Step 8

### Step 8 — Report idle

```
✅ Solo Mode — Epic N complete. No pending amendments.

Live URL: <from docs/deployment.md>

To add features: add rows to amendments.md targeting epic N+1, then run /solo-mode.

Artifacts:
- docs/design-epic-1.md … docs/design-epic-N.md   — per-epic blueprints
- docs/brd-coverage-epic-*.md                      — QA reports
- docs/review-report-epic-N.md                     — TechLead sign-offs
- docs/deployment.md                               — infrastructure + teardown guide
- .claude/agent-memory/                            — all inter-agent summaries
```

---

## Error Protocol

If any agent writes `ERROR` to `docs/.phase`:
1. Read the full error from `docs/.phase`
2. Report:
   ```
   ❌ Solo Mode halted at epic=N, phase=X.X
   Agent: <name>
   Reason: <error text>

   Fix the issue, then run /solo-mode to resume from this point.
   ```
3. Stop. Do not auto-fix or re-spawn.

---

## Constraints

- This skill never modifies application code directly
- This skill never writes to `docs/design-epic-*.md`, `apps/`, or `infrastructure/`
- State is always persisted in `docs/.phase` before spawning each agent
- The framework is fully autonomous after `/solo-mode` — no user prompts mid-run
- All agents read `brd.md` on every invocation — this is non-negotiable
