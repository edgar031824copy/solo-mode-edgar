# Team Mode Scalability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the solo-mode framework team-mode ready and scalable for adding new features, while keeping the epic-driven model and ensuring the recruitment app still ships with one command.

**Architecture:** Three targeted changes — (1) BRD gets freeze semantics so it works as a shared team contract, (2) design-epic-N.md is promoted from disposable output to protected amendable contract, (3) every agent-memory file gets a standard YAML frontmatter header so an integration pipeline can parse any team member's solo-mode output without reading prose. No changes to the epic-driven execution chain or agent order.

**Tech Stack:** Markdown file edits only — `brd.md`, `CLAUDE.md`, and 6 agent definition files in `.claude/agents/`.

> **Note:** Per project rules, agent file edits require user approval before execution. This plan is the proposal. Execute only after the user confirms.

> **Clean run:** After all changes are committed, the fresh run command is:
> ```bash
> rm -rf apps/ docs/ .claude/agent-memory/
> # then /solo-mode
> ```
> `.claude/plans/` is NOT deleted — it lives inside `.claude/` which is excluded from the clean run.

---

## Files Modified

| File | Change |
|------|--------|
| `brd.md` | Add logout to F-22; add BRD lifecycle note to § 11 Constraints |
| `CLAUDE.md` | Add "BRD Lifecycle & Design Contract" section with freeze rule, design doc protection, and agent-memory header standard |
| `.claude/agents/01-architect-agent.md` | Add YAML header to agent-memory output; add write-once constraint for design docs |
| `.claude/agents/02-developer-fe-agent.md` | Add YAML header to agent-memory output |
| `.claude/agents/03-developer-be-agent.md` | Add YAML header to agent-memory output |
| `.claude/agents/04-techlead-agent.md` | Add YAML header to agent-memory output |
| `.claude/agents/05-qa-agent.md` | Add YAML header to agent-memory output |
| `.claude/agents/06-devops-agent.md` | Add YAML header to agent-memory output |

---

## Task 1: Update brd.md — Add logout + BRD freeze semantics

**Files:**
- Modify: `brd.md` (F-22 in § 5.3, and § 11 Constraints)

- [ ] **Step 1: Update F-22 to include logout**

Find this line in `brd.md § 5.3 Authentication`:
```
| F-22 | Frontend has a `/login` page; unauthenticated users are redirected there on any 401 response |
```

Replace with:
```
| F-22 | Frontend has a `/login` page; unauthenticated users are redirected there on any 401 response; a logout button in the navigation bar clears the JWT from localStorage and redirects to `/login` |
```

- [ ] **Step 2: Add BRD lifecycle rule to § 11 Constraints**

Find the `## 11. Constraints & Assumptions` section. After the existing bullet list, add:

```markdown
- **BRD Lifecycle:** The BRD is the initial requirements contract. Once epic 1 execution begins, existing requirement text is stable — do not edit F-IDs in place. Add new capabilities as new F-IDs or new epic scope entries in § 4.4. This ensures traceability across multiple developers running their own solo-mode instances and prevents BRD drift in team settings.
```

- [ ] **Step 3: Verify the changes look correct**

Read `brd.md` and confirm:
- F-22 now includes the logout sentence
- § 11 has the BRD lifecycle bullet
- No other lines were accidentally changed

---

## Task 2: Update CLAUDE.md — BRD lifecycle + design doc protection + agent-memory header standard

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add new section after "## State Management"**

Find the `## State Management` section. After the full state table (ending with `| ERROR | Agent failed... |`), add a new section:

```markdown
---

## BRD Lifecycle and Design Contract

### BRD — Freeze After Epic 1 Starts
The BRD is the initial requirements contract. Once solo-mode execution begins, the BRD is stable:
- **Do not edit existing F-IDs in place** — downstream agents may have already read and acted on them
- **New features** → add a new F-ID entry and assign it to an epic scope in § 4.4
- **Scope changes for a future epic** → add a new entry in § 4.4 for that epic
- This rule enables multiple developers to share the same BRD without conflict in Team Mode

### design-epic-N.md — Protected Amendable Contract
The Architect writes `docs/design-epic-N.md` once per epic. It is the definitive technical contract for that epic:
- All Developer, TechLead, and QA agents consume it as their primary spec
- If a requirement must change mid-epic, amend the design doc first, then re-run the affected agent
- The Architect never regenerates it from scratch mid-epic — only appends or amends specific sections
- In Team Mode, `design-epic-N.md` is the integration boundary: other solo-mode instances read it to understand what this epic exposed

### Agent-Memory Standard Header
Every agent-memory file MUST begin with a YAML frontmatter block. This is what makes the outputs machine-parseable by an integration pipeline across multiple solo-mode instances:

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
```

- [ ] **Step 2: Verify no existing sections were displaced**

Read `CLAUDE.md` and confirm:
- The new section appears after `## State Management`
- The existing `## Epic Execution Rules`, `## Agent-Memory Protocol`, etc. are still intact
- No duplicate section headers

---

## Task 3: Update 01-architect-agent.md — YAML header + write-once constraint

**Files:**
- Modify: `.claude/agents/01-architect-agent.md`

- [ ] **Step 1: Update Step 3 (Write agent-memory summary) to prepend YAML header**

Find `### Step 3 — Write agent-memory summary` in the file. The instruction currently starts with:

```
Write `.claude/agent-memory/epic-N-architect.md`. Keep it under 80 lines. Prefix with the epic number so prior summaries are never overwritten.
```

Replace with:

```
Write `.claude/agent-memory/epic-N-architect.md`. Keep it under 80 lines. Prefix with the epic number so prior summaries are never overwritten.

Begin the file with this YAML frontmatter block (fill in actual values):
```yaml
---
epic: N
agent: architect
status: complete
phase: 1.0-complete
outputs: [docs/design-epic-N.md]
---
```

Then write the required sections below the frontmatter:
```

- [ ] **Step 2: Add write-once constraint to the Constraints section**

Find the `## Constraints` section at the bottom of the file. After the last bullet, add:

```markdown
- **Design doc is write-once per epic:** `docs/design-epic-N.md` is written once in Step 2 and then treated as a protected contract. If the file already exists when Step 2 runs (which should not happen under normal operation — the phase guard prevents re-invocation), do NOT overwrite it. Amend only the sections that need updating and document the amendment in the file header.
```

- [ ] **Step 3: Verify**

Read `.claude/agents/01-architect-agent.md` and confirm:
- Step 3 now includes the YAML frontmatter instruction
- The Constraints section includes the write-once rule
- Nothing else changed

---

## Task 4: Update 02-developer-fe-agent.md — YAML header

**Files:**
- Modify: `.claude/agents/02-developer-fe-agent.md`

- [ ] **Step 1: Update Step 6 (Write agent-memory summary)**

Find `### Step 6 — Write agent-memory summary` in the file. The instruction currently starts with:

```
Write `.claude/agent-memory/epic-N-fe.md`. Keep it under 60 lines.
```

Replace with:

```
Write `.claude/agent-memory/epic-N-fe.md`. Keep it under 60 lines.

Begin the file with this YAML frontmatter block (fill in actual values):
```yaml
---
epic: N
agent: fe
status: complete
phase: 2.1-complete
outputs: [apps/frontend/src/pages/..., apps/frontend/src/components/...]
---
```

Then write the required sections below the frontmatter:
```

- [ ] **Step 2: Verify**

Read `.claude/agents/02-developer-fe-agent.md` and confirm Step 6 includes the YAML frontmatter instruction.

---

## Task 5: Update 03-developer-be-agent.md — YAML header

**Files:**
- Modify: `.claude/agents/03-developer-be-agent.md`

- [ ] **Step 1: Update Step 9 (Write agent-memory summary)**

Find `### Step 9 — Write agent-memory summary` in the file. The instruction currently starts with:

```
Write `.claude/agent-memory/epic-N-be.md`. Keep it under 60 lines. Use the epic number in the filename so prior summaries are never overwritten.
```

Replace with:

```
Write `.claude/agent-memory/epic-N-be.md`. Keep it under 60 lines. Use the epic number in the filename so prior summaries are never overwritten.

Begin the file with this YAML frontmatter block (fill in actual values):
```yaml
---
epic: N
agent: be
status: complete
phase: 2.0-complete
outputs: [apps/backend/src/routes/..., prisma/migrations/...]
---
```

Then write the required sections below the frontmatter:
```

- [ ] **Step 2: Verify**

Read `.claude/agents/03-developer-be-agent.md` and confirm Step 9 includes the YAML frontmatter instruction.

---

## Task 6: Update 04-techlead-agent.md — YAML header

**Files:**
- Modify: `.claude/agents/04-techlead-agent.md`

- [ ] **Step 1: Update Step 7 (Write agent-memory summary)**

Find `### Step 7 — Write agent-memory summary` in the file. The instruction currently starts with:

```
Write `.claude/agent-memory/epic-N-techlead.md`. Keep it under 60 lines.
```

Replace with:

```
Write `.claude/agent-memory/epic-N-techlead.md`. Keep it under 60 lines.

Begin the file with this YAML frontmatter block (fill in actual values):
```yaml
---
epic: N
agent: techlead
status: complete
phase: 3.0-complete
outputs: [docs/review-report-epic-N.md]
---
```

Then write the required sections below the frontmatter:
```

- [ ] **Step 2: Verify**

Read `.claude/agents/04-techlead-agent.md` and confirm Step 7 includes the YAML frontmatter instruction.

---

## Task 7: Update 05-qa-agent.md — YAML header

**Files:**
- Modify: `.claude/agents/05-qa-agent.md`

- [ ] **Step 1: Update Step 9 (Write agent-memory summary)**

Find `### Step 9 — Write agent-memory summary` in the file. The instruction currently starts with:

```
Write `.claude/agent-memory/epic-N-qa.md`. Keep it under 50 lines.
```

Replace with:

```
Write `.claude/agent-memory/epic-N-qa.md`. Keep it under 50 lines.

Begin the file with this YAML frontmatter block (fill in actual values):
```yaml
---
epic: N
agent: qa
status: complete
phase: 4.0-complete
outputs: [docs/brd-coverage-epic-N.md, apps/frontend/e2e/]
---
```

Then write the required sections below the frontmatter:
```

- [ ] **Step 2: Verify**

Read `.claude/agents/05-qa-agent.md` and confirm Step 9 includes the YAML frontmatter instruction.

---

## Task 8: Update 06-devops-agent.md — YAML header

**Files:**
- Modify: `.claude/agents/06-devops-agent.md`

- [ ] **Step 1: Update Step 9 (Write agent-memory summary)**

Find `### Step 9 — Write agent-memory summary` in the file. The instruction currently starts with:

```
Write `.claude/agent-memory/epic-6-devops.md`. Keep it under 50 lines.
```

Replace with:

```
Write `.claude/agent-memory/epic-6-devops.md`. Keep it under 50 lines.

Begin the file with this YAML frontmatter block (fill in actual values):
```yaml
---
epic: 6
agent: devops
status: complete
phase: 5.0-complete
outputs: [infrastructure/terraform/, .github/workflows/deploy.yml, docs/deployment.md]
---
```

Then write the required sections below the frontmatter:
```

- [ ] **Step 2: Verify**

Read `.claude/agents/06-devops-agent.md` and confirm Step 9 includes the YAML frontmatter instruction.

---

## Task 9: Final verification before clean run

- [ ] **Step 1: Grep for YAML header in all agent files**

Run:
```bash
grep -l "agent:" /Users/edgar.hernandez/Desktop/solo-mode/.claude/agents/*.md
```
Expected: all 6 files returned.

- [ ] **Step 2: Verify brd.md F-22 includes logout**

Run:
```bash
grep "logout" /Users/edgar.hernandez/Desktop/solo-mode/brd.md
```
Expected: one line matching F-22 with the logout sentence.

- [ ] **Step 3: Verify CLAUDE.md has the new section**

Run:
```bash
grep "BRD Lifecycle" /Users/edgar.hernandez/Desktop/solo-mode/CLAUDE.md
```
Expected: the section header found.

- [ ] **Step 4: Do the clean run**

```bash
cd /Users/edgar.hernandez/Desktop/solo-mode
rm -rf apps/ docs/ .claude/agent-memory/
# Verify framework files are intact
ls .claude/agents/ .claude/skills/ .claude/plans/
# Then trigger /solo-mode
```

Expected after clean run: `docs/.phase` advances through all 6 epics; final app has login + logout + full recruitment features.
