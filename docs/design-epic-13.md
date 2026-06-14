# Design — Epic 13 (F-31: AWS Account Migration + OIDC)

**Amendment scope:** F-31 only — pure infrastructure migration, zero FE/BE application code changes.
**Source:** `amendments.md`, Status: pending → this epic completes it.

---

## § Infrastructure Architecture

### Migration Overview

| Dimension | Before (personal) | After (company) |
|-----------|-------------------|-----------------|
| AWS account | 503561459070 | 995603457880 |
| Auth method | Static IAM key in GitHub Secrets (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) | OIDC — role assumed at runtime, no long-lived key |
| OIDC role | n/a | `arn:aws:iam::995603457880:role/gha-aisdlc-deploy-role` |
| Terraform state | `infrastructure/terraform/terraform.tfstate` (local file) | S3 remote backend: `gorilla-tf-state-995603457880` / `solo-mode/terraform.tfstate` (us-east-1) |
| Frontend S3 bucket | `solo-mode-frontend-503561459070` | `solo-mode-frontend-995603457880` |
| Uploads S3 bucket | `solo-mode-uploads-503561459070` | `solo-mode-uploads-995603457880` |
| Lightsail instance | `solo-mode-api` (IP 34.226.38.150) | new `solo-mode-api` instance (new static IP) |
| CloudFront distribution | `E35L4HAEW78OW1` | new distribution ID (post-apply output) |
| Self-hosted runner | existing runner on old Lightsail | new runner auto-registered in new Lightsail user_data |

### Deployment Topology (post-migration)

```
GitHub Actions (github-hosted)           GitHub Actions (self-hosted)
terraform-provision.yml                  deploy.yml (deploy-backend + deploy-frontend)
terraform-destroy.yml                         |
        |                                     |
  OIDC → gha-aisdlc-deploy-role          self-hosted runner on Lightsail
        |                                     |
        v                                     |
  AWS (995603457880)                          |
  ┌──────────────────────────────────────────────────────────────┐
  │  Lightsail (solo-mode-api)  ←─────────── rsync + PM2 restart │
  │  PM2 → Node.js :3000                                          │
  │  GHA runner svc (actions.runner.*)                            │
  └──────────────────────────────────────────────────────────────┘
        |                                     |
        v                                     v
  S3 frontend bucket                    S3 + CloudFront
  CloudFront distribution               OIDC → gha-aisdlc-deploy-role
  S3 uploads bucket                     aws s3 sync / invalidation
  IAM user solo-mode-backend-s3
```

### Terraform Remote Backend Change

Add to `infrastructure/terraform/main.tf` inside the `terraform {}` block:

```hcl
backend "s3" {
  bucket = "gorilla-tf-state-995603457880"
  key    = "solo-mode/terraform.tfstate"
  region = "us-east-1"
}
```

Do NOT run `terraform state mv` or attempt to migrate local state. The existing local
`terraform.tfstate` references personal-account resource IDs that do not exist in the
company account. Initialize fresh with `terraform init -reconfigure` so Terraform starts
from empty remote state and provisions all resources from scratch in `995603457880`.

### Lightsail user_data — Self-Hosted Runner Block

Append the following block to `infrastructure/terraform/lightsail.tf` user_data, after the
PM2 startup section and before the final echo:

```bash
# 8. Register GitHub Actions self-hosted runner
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest \
  | grep tag_name | cut -d '"' -f 4 | sed 's/^v//')
mkdir -p /home/ubuntu/actions-runner
curl -fsSL \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
  -o /tmp/actions-runner.tar.gz
tar xzf /tmp/actions-runner.tar.gz -C /home/ubuntu/actions-runner
chown -R ubuntu:ubuntu /home/ubuntu/actions-runner

sudo -u ubuntu bash -c "
  cd /home/ubuntu/actions-runner
  ./config.sh \
    --url https://github.com/gorillalogic/edgar-solo-mode \
    --token ${var.runner_registration_token} \
    --name lightsail-runner \
    --labels self-hosted \
    --unattended
"

cd /home/ubuntu/actions-runner
./svc.sh install ubuntu
./svc.sh start
```

Note: `${var.runner_registration_token}` is a Terraform variable interpolated at `terraform apply`
time. The token is valid for 1 hour — generate immediately before triggering the provision workflow.

### New Terraform Variable

Add to `infrastructure/terraform/variables.tf`:

```hcl
variable "runner_registration_token" {
  description = "GitHub Actions runner registration token (valid 1 hour). Generate via: gh api -X POST repos/gorillalogic/edgar-solo-mode/actions/runners/registration-token --jq .token"
  type        = string
  sensitive   = true
}
```

Pass the value via workflow input (see CI/CD section) — do not commit it to `terraform.tfvars`.

### GitHub Secrets — Post-Migration Updates

After `terraform apply` outputs are available:

| Secret | Action | New value |
|--------|--------|-----------|
| `AWS_ACCESS_KEY_ID` | DELETE | n/a — replaced by OIDC |
| `AWS_SECRET_ACCESS_KEY` | DELETE | n/a — replaced by OIDC |
| `FRONTEND_BUCKET` | UPDATE | `solo-mode-frontend-995603457880` (Terraform output) |
| `CLOUDFRONT_DISTRIBUTION_ID` | UPDATE | new distribution ID (Terraform output) |
| `VITE_API_URL` | UPDATE | `http://<new-lightsail-static-ip>:3000` |
| `DATABASE_URL` | KEEP | unchanged |
| `JWT_SECRET` | KEEP | unchanged |
| `ANTHROPIC_API_KEY` | KEEP | unchanged |
| `AWS_REGION` | KEEP | `us-east-1` |
| `AWS_UPLOADS_BUCKET` | KEEP | `solo-mode-uploads-995603457880` (auto-named by Terraform) |

### Self-Hosted Runner Deconfliction

The old Lightsail runner (on 34.226.38.150, personal account) and the new runner both
carry the `self-hosted` label. GitHub will route jobs to either during the transition window.

After verifying the new runner is healthy, deregister the old one:

```bash
OLD_ID=$(gh api repos/gorillalogic/edgar-solo-mode/actions/runners \
  --jq '.runners[] | select(.name=="lightsail-runner") | .id' | head -1)
gh api -X DELETE "repos/gorillalogic/edgar-solo-mode/actions/runners/${OLD_ID}"
```

---

## § CI/CD Pipeline

### New: `terraform-provision.yml`

```
Trigger:       workflow_dispatch
               inputs:
                 runner_registration_token: required string
                   description: "GHA runner registration token (gh api -X POST repos/gorillalogic/edgar-solo-mode/actions/runners/registration-token --jq .token)"
Runs-on:       ubuntu-latest (GitHub-hosted — rare manual job)
Permissions:   id-token: write, contents: read
```

Steps:
1. `actions/checkout@v4`
2. `aws-actions/configure-aws-credentials@v4`
   - `role-to-assume: arn:aws:iam::995603457880:role/gha-aisdlc-deploy-role`
   - `aws-region: us-east-1`
3. `hashicorp/setup-terraform@v3`
4. `terraform init` in `infrastructure/terraform/` (uses remote backend — no `-reconfigure` flag needed here; first run after adding backend block requires `-reconfigure` locally, not in CI)
5. `terraform apply -auto-approve` with `-var="runner_registration_token=${{ inputs.runner_registration_token }}"` and all other sensitive vars via `TF_VAR_*` environment variables sourced from GitHub Secrets
6. Print outputs: lightsail IP, CloudFront domain, frontend bucket name, CloudFront distribution ID

Environment variables for the apply step (sourced from GitHub Secrets, not committed):
- `TF_VAR_database_url` ← `DATABASE_URL` secret
- `TF_VAR_jwt_secret` ← `JWT_SECRET` secret
- `TF_VAR_anthropic_api_key` ← `ANTHROPIC_API_KEY` secret
- `TF_VAR_runner_registration_token` ← `${{ inputs.runner_registration_token }}`

### New: `terraform-destroy.yml`

```
Trigger:       workflow_dispatch
               inputs:
                 confirm: required string
                   description: "Type 'destroy' to confirm full teardown"
Runs-on:       ubuntu-latest (GitHub-hosted)
Permissions:   id-token: write, contents: read
```

Steps:
1. `actions/checkout@v4`
2. Shell step — safety gate:
   ```bash
   if [ "${{ inputs.confirm }}" != "destroy" ]; then
     echo "Confirmation input does not match 'destroy'. Aborting."
     exit 1
   fi
   ```
3. `aws-actions/configure-aws-credentials@v4` (same OIDC role as provision)
4. `hashicorp/setup-terraform@v3`
5. `terraform init` in `infrastructure/terraform/`
6. `terraform destroy -auto-approve` with same `TF_VAR_*` env vars as provision

### Updated: `deploy.yml`

**deploy-backend job — no auth changes required.** This job runs on the self-hosted Lightsail runner
using local rsync and PM2 with no AWS API calls. No modifications to this job.

**deploy-frontend job — replace static credential env vars with OIDC.**

Add at the job level (not step level):
```yaml
permissions:
  id-token: write
  contents: read
```

Remove from the three AWS steps (Sync assets, Upload index.html, Invalidate CloudFront):
```yaml
# DELETE these lines from all three steps:
AWS_ACCESS_KEY_ID=${{ secrets.AWS_ACCESS_KEY_ID }} \
AWS_SECRET_ACCESS_KEY=${{ secrets.AWS_SECRET_ACCESS_KEY }} \
AWS_DEFAULT_REGION=${{ secrets.AWS_REGION }} \
```

Add a new step before "Sync assets to S3", after the "Build frontend" step:
```yaml
- name: Configure AWS credentials (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::995603457880:role/gha-aisdlc-deploy-role
    aws-region: us-east-1
```

After this step, the three AWS CLI commands run with ambient credentials — no inline key vars needed.

### DevOps Agent Execution Order

The DevOps agent MUST follow this exact sequence to avoid partial-state failures:

```
(a) Pre-check: aws iam get-role --role-name gha-aisdlc-deploy-role
    — confirm iam:CreateUser is not denied (Terraform creates solo-mode-backend-s3 IAM user)
(b) Add backend block to infrastructure/terraform/main.tf
(c) Add runner_registration_token to infrastructure/terraform/variables.tf
(d) Add runner setup block to infrastructure/terraform/lightsail.tf user_data
(e) Add .github/workflows/terraform-provision.yml
(f) Add .github/workflows/terraform-destroy.yml
(g) Update .github/workflows/deploy.yml (OIDC for frontend job)
(h) Commit and push all changes to main (triggers deploy.yml — expected to fail
    because old Lightsail runner is gone; this is acceptable)
(i) Generate fresh runner registration token:
    gh api -X POST repos/gorillalogic/edgar-solo-mode/actions/runners/registration-token --jq .token
(j) Trigger terraform-provision.yml via workflow_dispatch with the token
(k) Poll new Lightsail /health until HTTP 200
    Poll new CloudFront URL until response contains <div id="root">
(l) Update the 5 GitHub Secrets listed in Infrastructure Architecture section
(m) Push a no-op commit to trigger deploy.yml — verify new self-hosted runner picks it up
(n) Deregister old runner (see Self-Hosted Runner Deconfliction section)
(o) Verify login at new CloudFront URL with recruiter@gorilla.com / password123
    and confirm pre-screening works end to end
```

---

## § Technology Decision Log

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| OIDC over static IAM keys for CI/CD | Static keys are long-lived credentials that expire, rotate manually, and are a leak risk. OIDC tokens are scoped to a single workflow run, expire automatically, and require zero secret rotation. Company DevOps already provisioned the role; adoption is zero-cost. | Continue with static keys (rejected: security risk; company mandate to move away); AWS IAM Identity Center (rejected: over-engineered for a single repo) |
| Remote S3 Terraform state (`gorilla-tf-state-995603457880`) | Local `terraform.tfstate` is committed to the repo — a security anti-pattern that leaks resource IDs and sensitive outputs. Remote state in a company-managed bucket supports team access, state locking (S3 + DynamoDB optional), and audit logging. The bucket already exists — no provisioning needed. | Keep local state (rejected: exposes sensitive outputs in git history; single-developer bottleneck); Terraform Cloud (rejected: requires third-party account; company has S3 bucket ready) |
| Fresh state initialization (`terraform init -reconfigure`, no state migration) | The existing local state references personal-account resource IDs (S3 ARNs, Lightsail instance names with account-specific suffixes, CloudFront distribution IDs). These IDs do not exist in the company account and cannot be imported without significant manual effort. A clean apply from empty remote state is faster, safer, and verifiable. | `terraform state mv` to remote (rejected: personal-account resource IDs are meaningless in company account; import of 15+ resources is error-prone); `terraform import` all existing resources (rejected: some resources like IAM access keys cannot be imported) |
| workflow_dispatch for terraform-provision and terraform-destroy | Infrastructure provisioning and destruction are rare, deliberate operations. Manual trigger provides a human gate and an audit trail in GitHub Actions history. The runner registration token must be provided at trigger time, which naturally forces a human checkpoint. | Push-triggered provisioning (rejected: no human gate; infrastructure changes would be auto-applied on every push); Scheduled runs (rejected: no use case for scheduled infra teardown) |
| GitHub-hosted runner for terraform-provision/destroy | These are rare manual jobs (not part of the deploy path). The self-hosted runner does not exist until after `terraform apply` succeeds — using it for provisioning would be circular. GitHub-hosted runners for 2-3 runs per quarter have negligible billing impact. | Self-hosted runner for provision (rejected: circular dependency — runner is created by the provision job itself); Lightsail SSH-based Terraform (rejected: breaks the audit trail requirement; no OIDC available outside GHA) |
| Self-hosted Lightsail runner for deploy-backend | deploy-backend uses `rsync` and `PM2` commands that require local filesystem access on the Lightsail instance. Running these from a GitHub-hosted runner would require SSH, adding complexity and an SSH key secret. The self-hosted runner eliminates the SSH layer entirely. Already established in epic 9. | GitHub-hosted runner with SSH (rejected: adds SSH key secret management; SSH session is stateful and harder to debug) |
| Self-hosted runner for deploy-frontend (OIDC ambient credentials) | After adding the `configure-aws-credentials` OIDC step, the deploy-frontend job works from any runner that has internet access. Keeping it on self-hosted avoids GitHub-hosted minutes. The OIDC step handles auth; the runner just runs AWS CLI commands. | Dedicated GitHub-hosted runner for frontend only (rejected: minutes cost; self-hosted runner already available after Lightsail is up) |
