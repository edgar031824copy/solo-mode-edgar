---
name: open-pr
description: "Commit staged changes, push the current branch, and open a pull request on GitHub."
user-invocable: true
disable-model-invocation: true
---

You are preparing a pull request. Follow these steps exactly:

## 1. Inspect current state

Run `git status`, `git log --oneline -5`, and `git remote -v` to understand what's staged, the existing commit style, the current branch name, and the remote repo (owner + repo name).

Parse the remote URL to extract `owner` and `repo`. Examples:
- `git@github.com:alice/my-repo.git` → owner: `alice`, repo: `my-repo`
- `https://github.com/alice/my-repo.git` → owner: `alice`, repo: `my-repo`

## 2. Branch guard — if on main/master, create a feature branch

If the current branch is `main` or `master`:

1. Derive a branch name from the staged/uncommitted changes (e.g. `feat/add-open-pr-skill`, `fix/auth-middleware`, `refactor/agent-ordering`). Use kebab-case, prefix with `feat/`, `fix/`, or `refactor/` as appropriate.
2. Create and switch to it:
   ```bash
   git checkout -b <branch-name>
   ```
3. Continue with the rest of the steps using this new branch.

If already on a feature branch — skip this step.

## 3. Commit (only if needed)

- **If the working tree is clean** — skip this step.
- **If there are uncommitted changes** — stage only the relevant modified files by name (never `git add .`), then commit with a concise message focused on _why_, ending with:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## 4. Push

```bash
git push origin HEAD
```

## 5. Check for existing open PR

Use `mcp__github__list_pull_requests` with the parsed `owner`, `repo`, and `state: open`.

- **If an open PR already exists for the current branch** — do NOT create a new one. Tell the user the existing PR URL and that the new commits are already included.
- **If no open PR exists for the current branch** — create one in step 6.

## 6. Create the PR (only if none exists)

Use `mcp__github__create_pull_request` with:

- `owner`: parsed from remote URL
- `repo`: parsed from remote URL
- `head`: current branch name
- `base`: default branch (prefer `main`, fall back to `master` if that's what the remote uses)
- `draft`: `false`
- `title`: concise, match the commit style (`type: description`)
- `body`: use this template filled in with the actual changes:

```
## Summary
- <bullet 1>
- <bullet 2>

## Changes
- <file> — <why it changed>

## Test plan
- [ ] <relevant check for this project>
- [ ] <feature-specific check if applicable>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Do NOT merge the PR. Return the PR URL to the user.
