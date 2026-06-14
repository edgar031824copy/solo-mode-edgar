# Deployment Documentation — Epic 14 (F-32: API CloudFront HTTPS proxy)

## Live URL

**Frontend:** https://d3a8iu1mf8poh.cloudfront.net

Default login credentials:
- Email: `recruiter@gorilla.com`
- Password: `password123`

**Backend API:** https://d1ps4wuscc40sx.cloudfront.net (API CloudFront — added in Epic 14)

**Health check:** https://d1ps4wuscc40sx.cloudfront.net/health

---

## Environment

| Component | Service | Region | Tier |
|-----------|---------|--------|------|
| Frontend static files | AWS S3 | us-east-1 | Free tier |
| Frontend HTTPS + CDN | AWS CloudFront (`E3BUMR8JU99B6S`) | Global edge | Free tier |
| Backend HTTPS proxy | AWS CloudFront (`d1ps4wuscc40sx.cloudfront.net`) | Global edge | Free tier |
| Backend API | AWS Lightsail (`solo-mode-api`) | us-east-1a | $3.50/mo |
| Process manager | PM2 on Lightsail (systemd-managed) | — | Free |
| Database | Supabase PostgreSQL | — | Free tier |
| File uploads | AWS S3 (`solo-mode-uploads-995603457880`) | us-east-1 | Free tier |

**AWS Account:** `995603457880` (Gorilla Logic company account)
**Frontend CloudFront distribution ID:** `E3BUMR8JU99B6S`
**API CloudFront domain:** `d1ps4wuscc40sx.cloudfront.net`
**S3 frontend bucket:** `solo-mode-frontend-995603457880`
**S3 uploads bucket:** `solo-mode-uploads-995603457880`
**Lightsail instance IP:** `52.86.93.139`
**Terraform state:** S3 bucket `gorilla-tf-state-995603457880`, key `solo-mode/terraform.tfstate`

---

## Monthly Estimated Cost

| Service | Cost |
|---------|------|
| Lightsail nano_3_0 (1 vCPU, 512 MB RAM) | $3.50/mo |
| S3 storage + requests (free tier) | $0/mo |
| CloudFront (free tier: 1 TB egress) | $0/mo |
| Supabase (free tier) | $0/mo |
| **Total** | **~$3.50/mo** |

---

## Infrastructure as Code

All infrastructure is defined in `infrastructure/terraform/`. Remote state is stored in S3.

**Terraform remote state backend:**
```hcl
backend "s3" {
  bucket = "gorilla-tf-state-995603457880"
  key    = "solo-mode/terraform.tfstate"
  region = "us-east-1"
}
```

**Do NOT run `terraform apply` locally.** All Terraform operations run via GitHub Actions OIDC workflows using the company role `arn:aws:iam::995603457880:role/gha-aisdlc-deploy-role`.

---

## CI/CD Pipeline

**File:** `.github/workflows/deploy.yml`

**Trigger:** Push to `main` (paths: `apps/**`, `prisma/**`, `.github/workflows/**`, `infrastructure/**`) or manual dispatch

**Jobs:**
1. `deploy-backend` — runs directly on the self-hosted Lightsail runner (`runs-on: self-hosted`). Builds TypeScript, syncs files, writes env vars to `/etc/environment`, runs Prisma migrations, registers PM2 with systemd, restarts PM2.
2. `deploy-frontend` — (depends on `deploy-backend`) — builds the React SPA and syncs to S3 + CloudFront invalidation. Uses OIDC for AWS credentials (no static keys).

**Required GitHub Actions secrets:**

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `FRONTEND_BUCKET` | S3 bucket for frontend (`solo-mode-frontend-995603457880`) |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID (`E3BUMR8JU99B6S`) |
| `VITE_API_URL` | Backend API URL baked into React build (`https://d1ps4wuscc40sx.cloudfront.net`) |
| `AWS_UPLOADS_BUCKET` | S3 bucket for candidate CV uploads (`solo-mode-uploads-995603457880`) |
| `AWS_REGION` | AWS region (`us-east-1`) |
| `BACKEND_S3_ACCESS_KEY_ID` | IAM access key for uploads bucket (S3 uploads only) |
| `BACKEND_S3_SECRET_ACCESS_KEY` | IAM secret key for uploads bucket (S3 uploads only) |
| `CORS_ORIGIN` | Allowed CORS origin (`https://d3a8iu1mf8poh.cloudfront.net`) |

**Note:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are NOT used — replaced permanently by OIDC (`aws-actions/configure-aws-credentials@v4` with `role-to-assume`).

---

## Environment Variable Reference

### Backend (`apps/backend/.env`)

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Runtime environment (`production`) |
| `PORT` | HTTP port (`3000`) |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `JWT_SECRET` | JWT signing secret (≥ 32 chars) |
| `ANTHROPIC_API_KEY` | Claude API key for CV analysis |
| `CORS_ORIGIN` | Allowed CORS origin (`https://d3a8iu1mf8poh.cloudfront.net`) |
| `AWS_UPLOADS_BUCKET` | S3 bucket name for file uploads |
| `AWS_REGION` | AWS region for S3 client |
| `BACKEND_S3_ACCESS_KEY_ID` | IAM key scoped to the uploads bucket |
| `BACKEND_S3_SECRET_ACCESS_KEY` | IAM secret scoped to the uploads bucket |

### Frontend (build-time, `apps/frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL baked into the React bundle (e.g. `https://d3a8iu1mf8poh.cloudfront.net/api`) |

---

## Database Migrations

Migrations run automatically on every deploy via `npx prisma migrate deploy` in the `deploy-backend` job.

To run manually against production:
```bash
cd apps/backend
DATABASE_URL=<production-connection-string> npx prisma migrate deploy
```

---

## Teardown Instructions

**All resources are destroyed via GitHub Actions** (not locally — company audit trail requirement):

1. Go to: https://github.com/gorillalogic/edgar-solo-mode/actions/workflows/terraform-destroy.yml
2. Click "Run workflow"
3. Enter `destroy` in the confirmation field
4. Click "Run workflow"

This removes:
- CloudFront distribution (`E3BUMR8JU99B6S`)
- S3 frontend bucket (`solo-mode-frontend-995603457880`) and all its contents
- S3 uploads bucket (`solo-mode-uploads-995603457880`) and all its contents
- Lightsail instance (`solo-mode-api`) and static IP (`52.86.93.139`)
- CloudFront Functions (API path rewrite)

**Supabase is NOT managed by Terraform** — delete the project manually at https://supabase.com/dashboard if needed.

Expected teardown time: under 10 minutes.

---

## Architecture Diagram

```
Browser
  │
  ├── Page load ──▶ CloudFront (HTTPS) d3a8iu1mf8poh.cloudfront.net
  │                   └── S3 bucket (static files)
  │                       solo-mode-frontend-995603457880
  │                       React SPA (index.html + hashed assets)
  │
  └── API calls ──▶ CloudFront (HTTPS) d1ps4wuscc40sx.cloudfront.net
                      └── Lightsail HTTP :3000 (52.86.93.139.nip.io)
                          Node.js + Express + PM2 (systemd)
                          └── Supabase PostgreSQL (cloud)
```

Note (Epic 14 — F-32): A second CloudFront distribution proxies all API traffic over HTTPS to the Lightsail backend. This eliminates the browser mixed-content block (HTTPS page → HTTP API call). `VITE_API_URL` is now `https://d1ps4wuscc40sx.cloudfront.net` (no `/api` prefix — Express routes are top-level).

---

## GitHub Actions Runner

The self-hosted runner (`company-lightsail-runner`) runs on the Lightsail instance at `52.86.93.139`. It is registered with the `gorillalogic/edgar-solo-mode` repository and handles all `deploy.yml` jobs.

Runner registration token has a 1-hour TTL — must be generated fresh before triggering `terraform-provision.yml`.

To re-provision infrastructure from scratch:
1. Generate a runner token: `gh api -X POST repos/gorillalogic/edgar-solo-mode/actions/runners/registration-token --jq .token`
2. Trigger: `gh workflow run terraform-provision.yml --field runner_registration_token=<token>`
