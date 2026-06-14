---
epic: 14
agent: devops
status: complete
phase: 5.0-complete
outputs: [infrastructure/terraform/cloudfront_api.tf, infrastructure/terraform/outputs.tf, .github/workflows/deploy.yml, docs/deployment.md]
---

Date: 2026-05-21
Phase: epic=14,phase=5.0-complete

## F-32: API CloudFront HTTPS Proxy

Added `aws_cloudfront_distribution.api` in `infrastructure/terraform/cloudfront_api.tf`:
- Origin: `52.86.93.139.nip.io:3000` (HTTP)
- CachePolicyId: `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` (CachingDisabled)
- OriginRequestPolicyId: `b689b0a8-53d0-40ab-baf2-68738e2966ac` (AllViewerExceptHostHeader)
- Domain: `d1ps4wuscc40sx.cloudfront.net`

GitHub secret `VITE_API_URL` updated to `https://d1ps4wuscc40sx.cloudfront.net`.

## deploy.yml Fixes (discovered during recovery)

Two bugs fixed in the full-deploy health check path:
1. `sudo systemctl restart pm2-ubuntu` → added `|| true` (exits with code 7 transiently on this instance)
2. `curl http://localhost:3000/health` → added `2>/dev/null || echo "000"` inside `$()` (with `set -e`, curl exit-7 on connection-refused aborts the script before any retry)

Both fixes match the existing `restart_only` path which already handled these correctly.

## Runner

Self-hosted runner renamed from `lightsail-runner` to `company-lightsail-runner` to avoid name collision with personal Lightsail runner during recovery operations.

## Live URLs

- Frontend: https://d3a8iu1mf8poh.cloudfront.net
- Backend API: https://d1ps4wuscc40sx.cloudfront.net
- Health: https://d1ps4wuscc40sx.cloudfront.net/health → `{"status":"ok"}`

## Known Issues

None.
