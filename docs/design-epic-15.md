# Design — Epic 15: Fix CORS_ORIGIN Propagation to PM2 (F-33)

## Scope

**One file changes. One line added. Nothing else.**

This epic fixes a single bug: `CORS_ORIGIN` written to `/etc/environment` in `deploy.yml` is never sourced into the shell before `pm2 restart --update-env`, so PM2 runs with a stale origin. The fix is one shell command added to an existing step.

---

## F-33 — Fix CORS_ORIGIN env var propagation in deploy.yml

### Root cause
In `.github/workflows/deploy.yml`, the "Write production environment variables" step writes all secrets (including `CORS_ORIGIN`) to `/etc/environment`. The very next step calls `pm2 restart ecosystem.config.cjs --update-env`. The `--update-env` flag reads from the **current shell environment**, not from `/etc/environment`. Because GitHub Actions steps run in a fresh non-login subprocess, `/etc/environment` is never sourced — PM2 inherits a stale `CORS_ORIGIN` from its original user_data bootstrap instead.

### The fix — one line in deploy.yml

In `.github/workflows/deploy.yml`, in the step named **"Install production deps, migrate, restart PM2"**, add this line immediately before the `pm2 restart ecosystem.config.cjs --update-env` line:

```bash
set -a; source /etc/environment; set +a
```

That is the **entire change**. Nothing else.

### What the final block looks like (for reference)

```bash
# Source /etc/environment so --update-env picks up CORS_ORIGIN and other secrets
set -a; source /etc/environment; set +a
pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
```

---

## HARD CONSTRAINTS — agents must not violate these

| Constraint | Detail |
|------------|--------|
| Only file that changes | `.github/workflows/deploy.yml` |
| Only step that changes | "Install production deps, migrate, restart PM2" |
| Only addition | `set -a; source /etc/environment; set +a` before pm2 restart |
| `runs-on` values | **DO NOT CHANGE** — both jobs stay on `self-hosted` |
| New workflow files | **DO NOT CREATE** any new `.github/workflows/*.yml` files |
| Terraform files | **DO NOT TOUCH** — no Terraform changes of any kind |
| Frontend code | **DO NOT TOUCH** — zero FE changes needed |
| Backend code | **DO NOT TOUCH** — zero BE code changes needed |
| Prisma schema | **DO NOT TOUCH** |
| New npm packages | **DO NOT ADD** any dependencies |

---

## Agent assignments

### Developer BE Agent
- Make the one-line addition to `deploy.yml` described above
- Verify the diff is exactly one line added — no other changes
- Write `.claude/agent-memory/epic-15-be.md`

### Developer FE Agent
- **Nothing to do for this epic**
- Write `.claude/agent-memory/epic-15-fe.md` noting no FE changes

### TechLead Agent
- Verify the diff is exactly one line added in deploy.yml
- Confirm `runs-on: self-hosted` is unchanged on both jobs
- Confirm no new workflow files were created
- Confirm no Terraform files were modified
- Run backend unit tests only (`npm test` in `apps/backend`)
- Write `docs/review-report-epic-15.md` and `.claude/agent-memory/epic-15-techlead.md`

### QA Agent
- The fix is verified by triggering `deploy.yml` and confirming login works
- Smoke test: `curl https://d1ps4wuscc40sx.cloudfront.net/health` must return 200
- Smoke test: login at `https://d3a8iu1mf8poh.cloudfront.net` with `recruiter@gorilla.com / password123` must succeed (no CORS error)
- Check `access-control-allow-origin` header on `/health` response equals `https://d3a8iu1mf8poh.cloudfront.net`
- Write `docs/brd-coverage-epic-15.md` and `.claude/agent-memory/epic-15-qa.md`

### DevOps Agent (post-launch mode — epic ≥ 7)
- Commit the single-file change and push to main
- Trigger `deploy.yml` via `gh workflow run deploy.yml`
- Monitor the run — both jobs (`Deploy Backend`, `Deploy Frontend`) must show green
- Verify `curl https://d1ps4wuscc40sx.cloudfront.net/health` returns `access-control-allow-origin: https://d3a8iu1mf8poh.cloudfront.net`
- **DO NOT** run terraform, create workflows, or make any infrastructure changes
- Write `.claude/agent-memory/epic-15-devops.md`

---

## Definition of done

Login at `https://d3a8iu1mf8poh.cloudfront.net` succeeds. The `access-control-allow-origin` response header on any API call equals `https://d3a8iu1mf8poh.cloudfront.net`. One line was added to `deploy.yml`. Nothing else changed.
