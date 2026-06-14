# Infrastructure — Terraform

Provisions all AWS infrastructure for the Solo Mode Recruitment App.

## Services

| Component | Service | Cost |
|-----------|---------|------|
| Frontend static files | AWS S3 | ~$0/mo |
| Frontend HTTPS + CDN | AWS CloudFront | ~$0/mo |
| Backend API | AWS Lightsail (nano_3_0) | $3.50/mo |
| Database | Supabase free tier | $0/mo |
| **Total** | | **~$3.50/mo** |

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/downloads)
- AWS CLI configured with credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
- Supabase project with `DATABASE_URL`

## Deploy

```bash
cd infrastructure/terraform

# 1. Copy and fill in the example vars file
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — add database_url, jwt_secret, anthropic_api_key

# 2. Initialize Terraform
terraform init

# 3. Preview changes
terraform plan

# 4. Apply (creates all resources)
terraform apply -auto-approve

# 5. Get the live URL
terraform output live_url
```

After apply, the Lightsail instance runs the setup-lightsail.sh bootstrap script in the background.
It takes 3–5 minutes for Node.js + PM2 to start. Check `/health`:

```bash
LIGHTSAIL_IP=$(terraform output -raw lightsail_ip)
curl http://$LIGHTSAIL_IP:3000/health
```

## Destroy

Destroys all AWS resources (Lightsail, S3, CloudFront). Takes < 10 minutes.

```bash
terraform destroy -auto-approve
```

## Deployment Modes

### Mode 1 — CloudFront default URL (no DNS setup)

Leave `domain_name` and `acm_certificate_arn` empty in `terraform.tfvars`.
The app is immediately reachable at `https://<cloudfront-id>.cloudfront.net`.

### Mode 2 — Custom domain

1. Create an ACM certificate in **us-east-1** for your domain (user creates manually — DNS validation)
2. Set `domain_name` and `acm_certificate_arn` in `terraform.tfvars`
3. Run `terraform apply`
4. After apply, create a CNAME: `domain_name` → `cloudfront_domain` output value

## CI/CD

After initial provisioning, deployments are handled by GitHub Actions:
- `.github/workflows/ci.yml` — runs tests on every push and PR
- `.github/workflows/deploy.yml` — deploys to S3 + Lightsail on push to main

Required GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
`LIGHTSAIL_HOST`, `LIGHTSAIL_SSH_KEY`, `VITE_API_URL`, `FRONTEND_BUCKET`,
`CLOUDFRONT_DISTRIBUTION_ID`, `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`,
`CORS_ORIGIN`, `AWS_UPLOADS_BUCKET`.
