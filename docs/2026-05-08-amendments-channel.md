# amendments.md Change Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BRD truly frozen forever and introduce `amendments.md` as the sole channel for product scope changes, enabling clean Team Mode integration.

**Architecture:** Four file edits — `brd.md` and `CLAUDE.md` get updated freeze semantics, `01-architect-agent.md` reads `amendments.md` if it exists, and `SKILL.md` passes amendments context to the Architect. No changes to BE, FE, TechLead, QA, or DevOps agents — they consume `design-epic-N.md` which the Architect already produces. The app still ships with one `/solo-mode` command.

**Tech Stack:** Markdown file edits only — no code changes.

> **Note:** Per project rules, agent/skill file edits require user approval before execution. This plan is the proposal — execute only after confirmation.

> **Survives clean run:** `amendments.md` lives at the repo root alongside `brd.md`. Neither is touched by `rm -rf apps/ docs/ .claude/agent-memory/`.

---

## Files Modified

| File | Change |
|------|--------|
| `brd.md` | Update § 11 BRD Lifecycle bullet — absolute freeze, reference `amendments.md` |
| `CLAUDE.md` | Replace BRD freeze subsection — absolute freeze + define `amendments.md` format |
| `.claude/agents/01-architect-agent.md` | Add `amendments.md` to inputs table + Step 1 read list |
| `.claude/skills/solo-mode/SKILL.md` | Add `amendments.md` to pre-flight reads + Architect spawn context |

---

## Task 1: Fix brd.md § 11 — absolute freeze

**Files:**
- Modify: `brd.md` (§ 11 Constraints, BRD Lifecycle bullet)

- [ ] **Step 1: Replace the BRD Lifecycle bullet**

Find this exact text in `## 11. Constraints & Assumptions`:
```
- **BRD Lifecycle:** The BRD is the initial requirements contract. Once epic 1 execution begins, existing requirement text is stable — do not edit F-IDs in place. Add new capabilities as new F-IDs or new epic scope entries in § 4.4. This ensures traceability across multiple developers running their own solo-mode instances and prevents BRD drift in team settings.
```

Replace with:
```
- **BRD Lifecycle:** The BRD is frozen after epic 1 starts — never edit existing requirements and never append new F-IDs. All new features, UI changes, and scope amendments go into `amendments.md` at the repo root. Agents read both files; the BRD is the signed baseline, `amendments.md` is the living delta. This makes the BRD safe to share across team members without conflict.
```

- [ ] **Step 2: Verify**

Run:
```bash
grep "amendments.md" /Users/edgar.hernandez/Desktop/solo-mode/brd.md
```
Expected: one line in § 11 containing "amendments.md".

---

## Task 2: Fix CLAUDE.md — absolute freeze + define amendments.md

**Files:**
- Modify: `CLAUDE.md` (lines 112–117, the BRD freeze subsection)

- [ ] **Step 1: Replace the BRD freeze subsection**

Find this exact block in `## BRD Lifecycle and Design Contract`:
```
### BRD — Freeze After Epic 1 Starts
The BRD is the initial requirements contract. Once solo-mode execution begins, the BRD is stable:
- **Do not edit existing F-IDs in place** — downstream agents may have already read and acted on them
- **New features** → add a new F-ID entry and assign it to an epic scope in § 4.4
- **Scope changes for a future epic** → add a new entry in § 4.4 for that epic
- This rule enables multiple developers to share the same BRD without conflict in Team Mode
```

Replace with:
```
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
```

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "amendments.md\|Never append\|Living Change" /Users/edgar.hernandez/Desktop/solo-mode/CLAUDE.md
```
Expected: at least 3 lines — the subsection header, the "Never append" bullet, and the "amendments.md" references. Confirm `### design-epic-N.md` and `### Agent-Memory Standard Header` subsections are still intact below.

---

## Task 3: Update 01-architect-agent.md — read amendments.md

**Files:**
- Modify: `.claude/agents/01-architect-agent.md` (Inputs table + Step 1)

- [ ] **Step 1: Add amendments.md to the Inputs table**

Find this exact block in `## Inputs`:
```
| `CLAUDE.md` | Tech stack and coding constraints — non-negotiable |
```

Replace with:
```
| `CLAUDE.md` | Tech stack and coding constraints — non-negotiable |
| `amendments.md` (optional) | New F-IDs and scope changes since BRD was frozen — read if file exists at repo root |
```

- [ ] **Step 2: Add amendments.md read to Step 1**

Find this exact block in `### Step 1 — Read inputs`:
```
3. Read `brd.md § 4.4 Epic Scope` — identify the F-IDs assigned to Epic N. These are the ONLY requirements you design for.
4. Read `CLAUDE.md` in full.
```

Replace with:
```
3. Read `brd.md § 4.4 Epic Scope` — identify the F-IDs assigned to Epic N.
4. Read `CLAUDE.md` in full.
5. Check if `amendments.md` exists at the repo root. If it does, read it and merge any amendments with `Target Epic = N` and `Status = pending` into your scope for this epic. Treat them exactly like BRD F-IDs — design them fully in `docs/design-epic-N.md`.
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "amendments.md" /Users/edgar.hernandez/Desktop/solo-mode/.claude/agents/01-architect-agent.md
```
Expected: 3 lines — one in the Inputs table, one in Step 1 read list, one in the step instruction.

---

## Task 4: Update SKILL.md — amendments.md in pre-flight + Architect spawn

**Files:**
- Modify: `.claude/skills/solo-mode/SKILL.md` (Pre-flight section + Step 1)

- [ ] **Step 1: Add amendments.md to Pre-flight reads**

Find this exact block in `## Pre-flight`:
```
Before spawning any agent, read:
1. `brd.md` § 4.4 — epic scope table (which F-IDs belong to each epic)
2. `CLAUDE.md` — agent contract and epic rules
3. `docs/.phase` — current state. If file does not exist, treat as `epic=0,phase=4.0-complete` (so Step 0 advances to epic 1).
```

Replace with:
```
Before spawning any agent, read:
1. `brd.md` § 4.4 — epic scope table (which F-IDs belong to each epic)
2. `CLAUDE.md` — agent contract and epic rules
3. `docs/.phase` — current state. If file does not exist, treat as `epic=0,phase=4.0-complete` (so Step 0 advances to epic 1).
4. `amendments.md` (optional) — if it exists at the repo root, read it. Extract any rows where `Target Epic = N` and `Status = pending`. These are additional F-IDs to pass to the Architect alongside the BRD scope.
```

- [ ] **Step 2: Add amendments context to Architect spawn in Step 1**

Find this exact block in `### Step 1 — Architect Agent (Phase 1.0)`:
```
Spawn the Architect Agent (`01-architect-agent.md`) passing:
- Current epic number N
- This epic's F-ID scope from `brd.md § 4.4`
- Prior epic summaries are in `.claude/agent-memory/epic-*.md`
- Must write `docs/design-epic-N.md` (not `docs/design.md`)
- Must write `.claude/agent-memory/epic-N-architect.md`
- Must write `epic=N,phase=1.0-complete` on success
```

Replace with:
```
Spawn the Architect Agent (`01-architect-agent.md`) passing:
- Current epic number N
- This epic's F-ID scope from `brd.md § 4.4`
- Any amendments targeting Epic N from `amendments.md` (if file exists and has matching rows)
- Prior epic summaries are in `.claude/agent-memory/epic-*.md`
- Must write `docs/design-epic-N.md` (not `docs/design.md`)
- Must write `.claude/agent-memory/epic-N-architect.md`
- Must write `epic=N,phase=1.0-complete` on success
```

- [ ] **Step 3: Verify**

Run:
```bash
grep -n "amendments.md" /Users/edgar.hernandez/Desktop/solo-mode/.claude/skills/solo-mode/SKILL.md
```
Expected: 2 lines — one in Pre-flight, one in Step 1 Architect spawn.

---

## Task 5: Final cross-file verification

- [ ] **Step 1: Check all four files have amendments.md references**

Run:
```bash
grep -l "amendments.md" \
  /Users/edgar.hernandez/Desktop/solo-mode/brd.md \
  /Users/edgar.hernandez/Desktop/solo-mode/CLAUDE.md \
  /Users/edgar.hernandez/Desktop/solo-mode/.claude/agents/01-architect-agent.md \
  /Users/edgar.hernandez/Desktop/solo-mode/.claude/skills/solo-mode/SKILL.md
```
Expected: all 4 files listed.

- [ ] **Step 2: Confirm BRD no longer says "add new F-IDs to § 4.4"**

Run:
```bash
grep "add new F-ID\|new F-ID entry\|new epic scope entries" /Users/edgar.hernandez/Desktop/solo-mode/brd.md /Users/edgar.hernandez/Desktop/solo-mode/CLAUDE.md
```
Expected: no output — the old BRD-append language is gone from both files.

- [ ] **Step 3: Confirm existing sections untouched**

Run:
```bash
grep -c "design-epic-N.md — Protected\|Agent-Memory Standard Header\|Epic Execution Rules" /Users/edgar.hernandez/Desktop/solo-mode/CLAUDE.md
```
Expected: `3` — all three downstream sections still present.
