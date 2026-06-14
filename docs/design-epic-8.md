# Design — Epic 8 (CI/CD Deploy Fix)

**Amendment:** F-26 only — amendments-only epic, no BRD F-IDs in scope.
**Scope:** Fix `.github/workflows/deploy.yml` so the Lightsail BE deploy succeeds and the FE deploy is gated on BE success.
**Production code changes:** None. No schema changes. No new endpoints. No FE component changes.

---

## § Epic Summary

Epic 8 is a post-launch CI/CD operations fix. The Lightsail SSH deploy step has never succeeded because the Lightsail instance was bootstrapped manually (files were copied via SCP, not via `git clone`), so `git pull` errors with "fatal: not a git repository". Additionally, the `deploy-frontend` and `deploy-backend` jobs currently run in parallel — if BE fails, FE still deploys, leaving production in an inconsistent state (new frontend calling old backend API). Both issues are tracked as F-26 in `amendments.md`.

---

## § Problem Statement

### Problem 1 — `git pull` fails on Lightsail

The Lightsail instance (`solo-mode-api`, IP `34.226.38.150`) was bootstrapped during Epic 6 by:
1. Terraform provisioning the instance with `user_data` (installed Node.js, PM2, created `/home/ubuntu/solo-mode/`)
2. The DevOps agent manually copying backend files via `scp -r` and running Prisma migrations + PM2 over SSH

There was never a `git clone` of the repository on the instance. The `/home/ubuntu/solo-mode` directory contains application files but is not a git repository. `git pull origin main` therefore fails:

```
fatal: not a git repository (or any of the parent directories): .git
```

### Problem 2 — Parallel FE + BE deploys allow partial prod state

The current `deploy.yml` structure:

```
test-backend ─┐
               ├→ deploy-frontend  (parallel)
test-frontend ─┤
               └→ deploy-backend   (parallel)
```

If `deploy-backend` fails, `deploy-frontend` has already started (or completed), deploying a new FE build that calls endpoints which the old (or crashed) BE may not serve correctly. This risks a broken production state that silently affects end users.

---

## § API Contract Delta

None. No new or changed endpoints in this epic.

---

## § FE Component Tree Delta

None. No new or changed frontend components in this epic.

---

## § CI/CD Pipeline Fix

This section is the complete technical specification for the `deploy.yml` changes.

### Change 1 — Replace `git pull` with `rsync` in `deploy-backend`

**Mechanism:** The GitHub Actions runner already has the checked-out repository (`actions/checkout@v4`). Instead of asking the Lightsail instance to pull from GitHub, push the files from the CI runner to Lightsail using `rsync` over SSH.

**rsync invocation:**

```bash
rsync -avz --delete \
  -e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail_key" \
  apps/backend/ \
  ubuntu@${{ secrets.LIGHTSAIL_HOST }}:/home/ubuntu/solo-mode/apps/backend/
```

Flag meanings:
- `-a` — archive mode: preserves permissions, symlinks, timestamps
- `-v` — verbose output (visible in CI logs)
- `-z` — compress during transfer (reduces bandwidth over public internet)
- `--delete` — remove files on the remote that no longer exist in the source (keeps the instance in sync with the repo state)
- `-e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail_key"` — use the private key written from the `LIGHTSAIL_SSH_KEY` secret; `StrictHostKeyChecking=no` prevents interactive host-key prompt in CI

**Source path:** `apps/backend/` (the CI runner's checked-out working tree)
**Destination path:** `ubuntu@${{ secrets.LIGHTSAIL_HOST }}:/home/ubuntu/solo-mode/apps/backend/`

Note: the trailing slash on the source path is intentional — rsync copies the directory's *contents* into the destination, not the directory itself.

**SSH key setup before rsync:**

The `LIGHTSAIL_SSH_KEY` GitHub secret already exists (written in Epic 6). Before running `rsync`, the step must write the private key to disk:

```bash
mkdir -p ~/.ssh
echo "${{ secrets.LIGHTSAIL_SSH_KEY }}" > ~/.ssh/lightsail_key
chmod 600 ~/.ssh/lightsail_key
```

**Post-rsync commands via SSH (replacing the existing `appleboy/ssh-action` script):**

After rsync, run the install/build/migrate/restart commands over SSH using the same key:

```bash
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
  npm run build
  npx prisma generate
  npx prisma migrate deploy

  pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
  pm2 save

  echo "Backend deploy complete"
ENDSSH
```

**Implementation note:** Replace the `appleboy/ssh-action@v1` step with two native `run:` steps:
1. Step: "Write SSH key and rsync backend files" — write key, run rsync
2. Step: "Run post-deploy commands on Lightsail" — the SSH heredoc above

The `appleboy/ssh-action` should be removed entirely. Native `rsync` + `ssh` gives full control over error handling, secret injection, and log output.

### Change 2 — Gate `deploy-frontend` on `deploy-backend`

**Current `needs` on `deploy-frontend`:**
```yaml
needs: [test-backend, test-frontend]
```

**New `needs` on `deploy-frontend`:**
```yaml
needs: [test-backend, test-frontend, deploy-backend]
```

This makes the execution DAG sequential for the deploy stage:

```
test-backend ─┐
               ├→ deploy-backend → deploy-frontend
test-frontend ─┘
```

If `deploy-backend` fails (any step exits non-zero), GitHub Actions will skip `deploy-frontend` automatically — it will appear as "skipped" in the workflow run, not failed, which is the correct behavior. The production frontend (currently deployed) remains untouched.

### Complete revised `deploy-backend` job structure

```yaml
deploy-backend:
  name: Deploy Backend (Lightsail)
  runs-on: ubuntu-latest
  needs: [test-backend, test-frontend]

  steps:
    - uses: actions/checkout@v4

    - name: Write SSH key and rsync backend files
      run: |
        mkdir -p ~/.ssh
        echo "${{ secrets.LIGHTSAIL_SSH_KEY }}" > ~/.ssh/lightsail_key
        chmod 600 ~/.ssh/lightsail_key
        rsync -avz --delete \
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
          npm run build
          npx prisma generate
          npx prisma migrate deploy

          pm2 restart ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
          pm2 save

          echo "Backend deploy complete"
        ENDSSH
```

### Complete revised `deploy-frontend` job structure

Only the `needs` line changes:

```yaml
deploy-frontend:
  name: Deploy Frontend (S3 + CloudFront)
  runs-on: ubuntu-latest
  needs: [test-backend, test-frontend, deploy-backend]   # ← added deploy-backend
  # ... all remaining steps unchanged
```

---

## § Environment Variables

No new secrets required. All required secrets already exist in the GitHub repository from Epic 6:

| Secret | Purpose | Status |
|--------|---------|--------|
| `LIGHTSAIL_HOST` | Lightsail instance IP (`34.226.38.150`) | Exists from Epic 6 |
| `LIGHTSAIL_SSH_KEY` | Private SSH key for `ubuntu@Lightsail` | Exists from Epic 6 |
| `DATABASE_URL` | Supabase connection string | Exists from Epic 6 |
| `JWT_SECRET` | JWT signing key | Exists from Epic 6 |
| `ANTHROPIC_API_KEY` | Anthropic API key | Exists from Epic 6 |
| `CORS_ORIGIN` | Allowed origin (`https://d36qh2h56p23nc.cloudfront.net`) | Exists from Epic 6 |
| `AWS_UPLOADS_BUCKET` | S3 uploads bucket name | Exists from Epic 6 |
| `AWS_REGION` | AWS region | Exists from Epic 6 |
| `AWS_ACCESS_KEY_ID` | AWS credentials | Exists from Epic 6 |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | Exists from Epic 6 |
| `FRONTEND_BUCKET` | S3 frontend bucket name | Exists from Epic 6 |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID | Exists from Epic 6 |
| `VITE_API_URL` | Frontend API base URL | Exists from Epic 6 |

---

## § Verification Plan

After the fix is merged to `main` and the deploy workflow runs:

1. **Check GitHub Actions run** — all four jobs must show green:
   - Backend Tests (deploy gate): SUCCESS
   - Frontend Tests (deploy gate): SUCCESS
   - Deploy Backend (Lightsail): SUCCESS (previously FAILURE)
   - Deploy Frontend (S3 + CloudFront): SUCCESS

2. **Verify rsync step logs** — the "Write SSH key and rsync backend files" step should show rsync output listing transferred files and end with `sent X bytes`.

3. **Verify post-deploy SSH step logs** — "Run post-deploy commands on Lightsail" should show `npm ci`, `prisma migrate deploy` output, PM2 restart confirmation, and `Backend deploy complete`.

4. **Live health check:**
   ```bash
   curl http://34.226.38.150:3000/health
   # Expected: {"status":"ok","timestamp":"..."}
   ```

5. **Live API proxy check:**
   ```bash
   curl https://d36qh2h56p23nc.cloudfront.net/api/health
   # Expected: {"status":"ok","timestamp":"..."}
   ```

6. **Confirm sequential deploy behavior** — in the GitHub Actions UI, `deploy-frontend` must show as "waiting" until `deploy-backend` completes, confirming the `needs` dependency is respected.

7. **Simulate BE failure (optional manual test)** — temporarily break the SSH command, confirm `deploy-frontend` shows "Skipped" not "Failed", and the S3 bucket is not updated.

---

## § Files Changed

| File | Change |
|------|--------|
| `.github/workflows/deploy.yml` | Replace `appleboy/ssh-action` step in `deploy-backend` with two `run:` steps (SSH key write + rsync; SSH post-deploy commands). Add `deploy-backend` to `deploy-frontend` `needs:` list. |

No other files are modified.

---

## § Technology Decision Log

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| rsync over SSH instead of git pull | Lightsail instance has no git repo; rsync pushes files from CI runner (which has a clean checkout) without requiring git state on the remote | `git clone` on the instance (requires GitHub credentials on Lightsail, adds complexity); re-provisioning via Terraform (destructive, causes downtime) |
| Remove `appleboy/ssh-action`, use native `run:` steps | Gives direct control over secret interpolation into the SSH heredoc; secrets cannot be injected into `appleboy/ssh-action` `env:` block for use inside the remote script | Keep `appleboy/ssh-action` (secrets passed as `env:` are available as env vars on the runner, not on the remote server — this is the root cause of the broken secret injection in the current script) |
| `needs: [deploy-backend]` on `deploy-frontend` | Native GitHub Actions dependency — simplest, zero overhead, skips FE cleanly if BE fails | Separate workflow triggered by BE success event (more complex, adds latency); single job (cannot parallelize test jobs) |
| `--delete` flag on rsync | Ensures the remote matches the repo exactly — removes stale compiled files that would otherwise accumulate and potentially shadow newer versions | Omit `--delete` (risks stale files causing runtime errors after file renames/moves) |
