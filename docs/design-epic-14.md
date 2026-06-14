# Design — Epic 14: F-32 API CloudFront Distribution (HTTPS Mixed-Content Fix)

**Date:** 2026-05-21
**Amendment:** F-32
**Scope:** Terraform only — no FE or BE application code changes.
**Status:** Active

---

## Context

The frontend is served over HTTPS from CloudFront (`https://d3a8iu1mf8poh.cloudfront.net`).
The current `VITE_API_URL` GitHub secret points to `http://52.86.93.139:3000` — a plain HTTP
Lightsail IP baked into the React bundle at build time. Modern browsers enforce Mixed Content
blocking: an HTTPS page cannot make HTTP sub-resource requests. All API calls silently fail
(0 response headers, `net::ERR_BLOCKED_BY_CONTENT_SETTINGS`).

Fix: add a second CloudFront distribution as an HTTPS proxy in front of the Lightsail backend.
The frontend then calls `https://<api-cloudfront-domain>` — fully HTTPS, no mixed-content block.
No route rewriting is needed (unlike the main distribution which strips `/api`). No FE or BE
code changes are required; only Terraform + two GitHub secrets need updating.

**Current live state (post-Epic 13):**
- Frontend CloudFront: `d3a8iu1mf8poh.cloudfront.net` (distribution ID `E3BUMR8JU99B6S`)
- Backend Lightsail static IP: `52.86.93.139`
- Terraform state: S3 `gorilla-tf-state-995603457880 / solo-mode/terraform.tfstate`

---

## § Infrastructure Architecture

### Topology After Epic 14

```
Browser (HTTPS only)
  │
  ├── https://d3a8iu1mf8poh.cloudfront.net   (frontend CloudFront — unchanged)
  │     │
  │     ├── /* ─────────────────────────────── S3 bucket (React SPA)
  │     └── /api/* ──────────────────────────── Lightsail :3000 (CF Function strips /api)
  │
  └── https://<api-cloudfront-domain>          (NEW — API CloudFront distribution)
        │
        └── /* ─────────────────────────────── Lightsail :3000 (no path rewriting)
              HTTP origin (port 3000, nip.io wildcard DNS)
```

The frontend's `VITE_API_URL` is updated from `http://52.86.93.139:3000` to
`https://<api-cloudfront-domain>`. The React bundle calls the new HTTPS endpoint —
no mixed-content block.

Note: the frontend CloudFront `/api/*` behavior (existing) is NOT removed. It remains
functional as a backup routing path. The new API CloudFront distribution is the primary
path used by `VITE_API_URL`.

### New Terraform Resource: `cloudfront_api.tf`

File: `infrastructure/terraform/cloudfront_api.tf`

```hcl
# ─── API CloudFront Distribution ─────────────────────────────────────────────
# Provides an HTTPS termination layer in front of the Lightsail backend.
# VITE_API_URL is updated to https://<this distribution domain> after apply.
# The React frontend hits this HTTPS endpoint — no mixed-content block.
#
# Origin: Lightsail static IP via nip.io (same pattern as cloudfront.tf).
# No path rewriting — Express routes are mounted at root, frontend calls /auth/login etc.
# CachingDisabled policy ensures no responses are cached.
# AllViewerExceptHostHeader origin request policy strips the Host header so Express
# does not receive the CloudFront domain as Host (which could confuse routing).

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} — API HTTPS proxy (F-32)"
  price_class     = "PriceClass_100"

  origin {
    domain_name = "${aws_lightsail_static_ip.api.ip_address}.nip.io"
    origin_id   = "LightsailAPIOrigin"

    custom_origin_config {
      http_port              = 3000
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # Match the 60s read timeout in the main distribution (Claude calls can take 30-60s)
      origin_read_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = "LightsailAPIOrigin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    # CachingDisabled managed policy — ID is stable across all AWS accounts/regions
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

    # AllViewerExceptHostHeader — forwards all headers except Host to origin.
    # Required: prevents the CloudFront *.cloudfront.net Host header from reaching Express.
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1"
  }

  tags = {
    project = "solo-mode"
  }
}
```

### New Terraform Output in `outputs.tf`

Append to `infrastructure/terraform/outputs.tf`:

```hcl
output "api_cloudfront_domain" {
  description = "API CloudFront distribution domain — use as VITE_API_URL base (https://<domain>)"
  value       = aws_cloudfront_distribution.api.domain_name
}
```

### No Changes Required To

- `main.tf` — backend "s3" block already present, no changes needed
- `variables.tf` — no new variables needed; the new distribution reuses `aws_lightsail_static_ip.api`
- `cloudfront.tf` — existing distribution and `/api/*` behavior unchanged
- `lightsail.tf` — no changes; the CORS_ORIGIN local will be updated separately via GitHub secret
- `s3_frontend.tf`, `s3_uploads.tf` — unchanged

### Post-Apply Secret Updates

After `terraform-provision.yml` applies and outputs `api_cloudfront_domain`:

| GitHub Secret | Old Value | New Value |
|---------------|-----------|-----------|
| `VITE_API_URL` | `http://52.86.93.139:3000` | `https://<api_cloudfront_domain>` |
| `CORS_ORIGIN` | (current value) | `https://d3a8iu1mf8poh.cloudfront.net` |

`CORS_ORIGIN` must already equal `https://d3a8iu1mf8poh.cloudfront.net`. Verify it matches
before updating. If it already matches, no update needed for CORS_ORIGIN — only VITE_API_URL
requires a change.

After secrets are updated, trigger a new frontend deploy so the React bundle is rebuilt with
the new `VITE_API_URL` baked in.

### Deployment Execution Order for DevOps Agent

1. Write `infrastructure/terraform/cloudfront_api.tf` with the resource above.
2. Append the `api_cloudfront_domain` output to `infrastructure/terraform/outputs.tf`.
3. Commit both files and push to `main`.
4. Generate a fresh runner registration token (1-hour TTL):
   `gh api -X POST repos/gorillalogic/edgar-solo-mode/actions/runners/registration-token --jq .token`
5. Trigger `terraform-provision.yml` with the token as workflow input.
6. Wait for workflow to complete; capture `api_cloudfront_domain` from Terraform outputs.
7. Update GitHub secret `VITE_API_URL` to `https://<api_cloudfront_domain>`.
8. Verify `CORS_ORIGIN` secret equals `https://d3a8iu1mf8poh.cloudfront.net`; update if not.
9. Trigger a new frontend deploy (push an empty commit or manually dispatch `deploy.yml`).
10. Smoke test: open `https://d3a8iu1mf8poh.cloudfront.net`, log in, trigger pre-screening.
    Confirm no `net::ERR_BLOCKED_BY_CONTENT_SETTINGS` errors in browser DevTools Network tab.

### Infrastructure Cost Impact

The API CloudFront distribution is free tier. CloudFront free tier covers 1 TB egress/month
and 10 million requests/month. At current usage the additional distribution stays within free
tier indefinitely. Monthly cost remains **~$3.50/mo** (Lightsail only).

---

## § Technology Decision Log

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|-----------------------|
| Second CloudFront distribution for API rather than updating VITE_API_URL to use the existing frontend CloudFront `/api/*` behavior | The existing frontend CloudFront `/api/*` behavior works for same-origin requests from the browser, but `VITE_API_URL` is a standalone base URL — the React app appends paths like `/auth/login`, `/candidates`, etc. Pointing VITE_API_URL at `https://d3a8iu1mf8poh.cloudfront.net/api` would require updating the frontend API client to not double-append `/api`. A dedicated API distribution with no path rewriting is cleaner and avoids touching FE code. | Using `https://d3a8iu1mf8poh.cloudfront.net` (frontend CF) with path prefix — requires FE API client changes; rejected to keep this purely Terraform + secrets. |
| `CachingDisabled` managed policy (`4135ea2d-...`) | All API calls must reach the origin — auth, mutation, and AI calls must never be served stale from cache. AWS-managed policy is always present in every account with no setup. | Custom cache policy with TTL=0 — more configuration for identical behavior. |
| `AllViewerExceptHostHeader` origin request policy (`b689b0a8-...`) | CloudFront sends its own domain as the `Host` header by default. Express on Lightsail would receive `<random>.cloudfront.net` as Host, which could confuse middleware. This managed policy strips Host and forwards all other viewer headers (including Authorization, Content-Type, Origin). | Custom origin request policy — redundant; managed policy already covers this. |
| `origin_read_timeout = 60` | Matches the timeout set on the existing Lightsail origin in `cloudfront.tf`. Claude API calls (pre-screen, post-screen) can take 30–60s. Without this, CloudFront returns 504 before the response arrives. | Default 30s — insufficient for Claude responses on large CVs; causes 504 errors. |
| `PriceClass_100` | US, Canada, Europe edge locations only — consistent with existing frontend distribution setting. All current users are in the Americas/Europe. Lower cost than `PriceClass_All`. | `PriceClass_All` — unnecessary cost increase for no benefit at current scale. |
| Terraform via `terraform-provision.yml` (not locally) | Company audit trail requirement — all Terraform runs against account 995603457880 must go through GitHub Actions OIDC. Local `terraform apply` is never used against the company account. | Local apply — blocked by company DevOps policy. |
