# Design — Epic 9 (Amendment F-27)

**Status:** authoritative spec — written once; amend specific sections only if scope changes

**Scope:** F-27 — Fix BE CI deploy so it never fails due to missing build tooling  
**No DB schema changes. No FE changes. No new API endpoints.**

---

## § CI/CD Pipeline Delta

Epic 9 modifies two files:

1. `.github/workflows/deploy.yml` — `deploy-backend` job (changes only; all other jobs unchanged)
2. `apps/backend/package.json` — move `prisma` from `devDependencies` to `dependencies`

A fourth sub-task (F-27.4) updates the DevOps agent prompt to commit framework state files — this is a
`.claude/agents/06-devops-agent.md` patch; no CI/CD YAML change is required for it.

---

### F-27.1 — Compile TypeScript on the CI runner before rsync

**Problem:** The current `deploy-backend` job rsyncs source files to Lightsail, then runs
`npm run build` (which calls `tsc`) on the Lightsail instance. If TypeScript compilation fails, the
failure happens on the production server after files have already been overwritten — there is no
rollback. Any `tsc` error leaves production in a broken state.

**Fix:** Add a Node.js setup + build step to the `deploy-backend` job on the CI runner, before the
rsync step. The sequence must be:

```
1. actions/checkout@v4              (already present)
2. actions/setup-node@v4 (node 22)  — ADD
3. npm ci (apps/backend)            — ADD
4. npm run build (apps/backend)     — ADD  ← tsc runs here; failure aborts before rsync
5. Write SSH key and rsync          — MODIFY (see F-27.2)
6. Run post-deploy commands         — MODIFY (see below)
```

Steps 2–4 added before the existing "Write SSH key and rsync backend files" step.

**Post-deploy SSH heredoc change:** Remove `npm run build` from the Lightsail-side SSH heredoc.
TypeScript has already been compiled on the CI runner and `dist/` is part of the rsync payload.
The Lightsail post-deploy sequence becomes:

```bash
set -e
# env exports unchanged
cd /home/ubuntu/solo-mode/apps/backend
npm ci --omit=dev
npx prisma generate
npx prisma migrate deploy
pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save
echo "Backend deploy complete"
```

`npm run build` is deleted from the heredoc. All other lines are unchanged.

**Full replacement for the `deploy-backend` job:**

```yaml
deploy-backend:
  name: Deploy Backend (Lightsail)
  runs-on: ubuntu-latest
  needs: [test-backend, test-frontend]

  steps:
    - uses: actions/checkout@v4

    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: 'npm'
        cache-dependency-path: apps/backend/package-lock.json

    - name: Install backend dependencies (CI runner)
      run: npm ci
      working-directory: apps/backend

    - name: Build backend (TypeScript compile on CI runner)
      run: npm run build
      working-directory: apps/backend

    - name: Write SSH key and rsync backend files
      run: |
        mkdir -p ~/.ssh
        echo "${{ secrets.LIGHTSAIL_SSH_KEY }}" > ~/.ssh/lightsail_key
        chmod 600 ~/.ssh/lightsail_key
        rsync -avz --delete \
          --exclude='node_modules' \
          -e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail_key" \
          apps/backend/ \
          ubuntu@${{ secrets.LIGHTSAIL_HOST }}:/home/ubuntu/solo-mode/apps/backend/

    - name: Run post-deploy commands on Lightsail
      run: |
        ssh -o StrictHostKeyChecking=no \
            -i ~/.ssh/lightsail_key \
            ubuntu@${{ secrets.LIGHTSAIL_HOST }} << 'ENDSSH'
          set -e

          export NODE_ENV=production
          export DATABASE_URL="${{ secrets.DATABASE_URL }}"
          export JWT_SECRET="${{ secrets.JWT_SECRET }}"
          export ANTHROPIC_API_KEY="${{ secrets.ANTHROPIC_API_KEY }}"
          export CORS_ORIGIN="${{ secrets.CORS_ORIGIN }}"
          export AWS_UPLOADS_BUCKET="${{ secrets.AWS_UPLOADS_BUCKET }}"
          export AWS_REGION="${{ secrets.AWS_REGION }}"
          export AWS_ACCESS_KEY_ID="${{ secrets.AWS_ACCESS_KEY_ID }}"
          export AWS_SECRET_ACCESS_KEY="${{ secrets.AWS_SECRET_ACCESS_KEY }}"

          cd /home/ubuntu/solo-mode/apps/backend
          npm ci --omit=dev
          npx prisma generate
          npx prisma migrate deploy

          pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
          pm2 save

          echo "Backend deploy complete"
ENDSSH
```

Note: `ENDSSH` terminator must remain at column 0 after YAML block-scalar stripping — no leading whitespace.

---

### F-27.2 — Exclude node_modules from rsync

**Problem:** The current rsync command transfers the full `apps/backend/` tree including
`node_modules/` (if present from the CI install step). Transferring node_modules over SSH is slow
(~50 000+ files), is unnecessary (Lightsail runs its own `npm ci --omit=dev`), and can corrupt the
server's module graph if the CI runner's OS/arch differs from Ubuntu 22.04 (native addons, `.node`
binaries).

**Fix:** Add `--exclude='node_modules'` to the rsync invocation. This flag is already shown in the
full job block above (F-27.1). No other rsync flags change.

**Exact rsync line (canonical reference):**

```
rsync -avz --delete \
  --exclude='node_modules' \
  -e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail_key" \
  apps/backend/ \
  ubuntu@${{ secrets.LIGHTSAIL_HOST }}:/home/ubuntu/solo-mode/apps/backend/
```

`--delete` remains so deleted source files are removed on the server. `--exclude='node_modules'`
prevents both transferring and deleting the server's `node_modules/` directory.

---

### F-27.3 — Move prisma from devDependencies to dependencies

**Problem:** On Lightsail, post-deploy runs `npm ci --omit=dev`. With `prisma` in `devDependencies`,
the `prisma` CLI binary is not installed, so `npx prisma generate` and `npx prisma migrate deploy`
both fail with "prisma: not found" (npx falls back to remote fetch, which fails in restricted network
environments or produces version mismatches).

**Fix:** In `apps/backend/package.json`, move the `prisma` entry from `devDependencies` to
`dependencies`.

**Current state (`devDependencies`):**
```json
"devDependencies": {
  ...
  "prisma": "^7.8.0",
  ...
}
```

**Target state (`dependencies`):**
```json
"dependencies": {
  ...
  "prisma": "^7.8.0",
  ...
}
```

The `@prisma/client` package is already in `dependencies` — this change only moves the CLI.
After editing `package.json`, run `npm install` locally to regenerate `package-lock.json` so
the lockfile is consistent. Commit both `package.json` and `package-lock.json`.

---

### F-27.4 — DevOps post-launch agent: always commit framework state files

**Problem:** After each post-launch epic (epics 7, 8), the DevOps agent commits and pushes only the
application code change (e.g., `deploy.yml`). Framework state files — `docs/.phase`,
`amendments.md`, and `.claude/agent-memory/epic-N-*.md` — are left as uncommitted working-tree
changes. This creates a divergence between HEAD and the actual run state; `git status` is dirty after
every DevOps invocation.

**Fix:** Patch `.claude/agents/06-devops-agent.md`.

In the post-launch workflow section, the commit step must be changed from committing only the
changed application file to committing all of the following in a single commit:

```
git add .github/workflows/deploy.yml   # or whatever app file changed
git add docs/.phase
git add amendments.md
git add .claude/agent-memory/
git commit -m "<conventional commit message for the epic>"
git push origin main
```

The DevOps agent must never leave any of these files in an uncommitted state after the deploy push.

**Exact wording to add to 06-devops-agent.md** — insert as a subsection in the "Post-launch deploy"
workflow, immediately before the `git push` instruction:

> Before committing the application change, also stage all framework state files:
> `docs/.phase`, `amendments.md`, and every file under `.claude/agent-memory/`.
> Include them in the same commit as the application change so HEAD always reflects
> the full run state. No loose changes should remain after the push.

---

## § Technology Decision Log

| Decision | Rationale | Alternatives Rejected |
|---|---|---|
| Compile TypeScript on CI runner (not Lightsail) | Fail fast before touching production; CI runner is ephemeral and safe to fail on; Lightsail production state is never modified unless build succeeds | Keep `tsc` on server — rejected because any compile error corrupts production; add Dockerfile/rollback — out of scope for this stack |
| `--exclude='node_modules'` in rsync | Avoids transferring ~50k binary files; prevents arch-mismatch for native addons; Lightsail installs its own clean prod deps via `npm ci --omit=dev` | rsync without exclude — rejected due to transfer time and binary incompatibility risk |
| Move `prisma` to `dependencies` (not devDependencies) | `npm ci --omit=dev` on Lightsail does not install devDependencies; `prisma` CLI is required at runtime for migrations | Use npx remote fetch — rejected due to version drift and network dependency; separate migration job — out of scope |
| Commit framework state files in same DevOps commit | Keeps HEAD always consistent with run state; prevents dirty working tree and lost context across epic boundaries | Separate commit per file type — rejected as unnecessarily complex; rely on next run to commit — rejected because state drift accumulates |
