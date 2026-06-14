# design-epic-6.md — Deployment + S3 File Migration

**Epic:** 6
**Scope:** NF-01, NF-02, NF-05, NF-06 (Deployment) + F-24 (S3 file storage migration)
**Author:** Architect Agent
**Date:** 2026-05-11
**Phase:** 1.0-complete

---

## § Infrastructure Architecture

### Cloud Topology

```
Internet
    │
    ▼
┌─────────────────────────────────────┐
│  AWS CloudFront Distribution        │
│  - HTTPS termination (ACM cert)     │
│  - Custom domain (recruiter.app)    │
│  - Behavior 1: /* → S3 origin       │
│    (static frontend assets)         │
│  - Behavior 2: /api/* → Lightsail   │
│    (proxy to backend, strips /api)  │
└──────────┬──────────────────────────┘
           │                    │
           ▼                    ▼
┌─────────────────┐   ┌────────────────────────┐
│  AWS S3 Bucket  │   │  AWS Lightsail Instance │
│  (frontend)     │   │  $3.50/mo — 512 MB RAM  │
│  Static hosting │   │  Node.js + Express       │
│  Private bucket │   │  PM2 process manager     │
│  + OAC policy   │   │  Port 3000               │
└─────────────────┘   └──────────┬───────────────┘
                                 │
                    ┌────────────┴──────────────┐
                    │                           │
                    ▼                           ▼
         ┌──────────────────┐       ┌───────────────────┐
         │  Supabase (free) │       │  AWS S3 Bucket    │
         │  PostgreSQL DB   │       │  (uploads)        │
         │  Connection via  │       │  Private — no     │
         │  DATABASE_URL    │       │  public access    │
         └──────────────────┘       └───────────────────┘
```

### Key Topology Decisions

1. **CloudFront behavior for `/api/*`**: CloudFront forwards `Path Pattern: /api/*` to the Lightsail origin after stripping the `/api` prefix. This resolves the [EPIC-2][LOW] known issue (file links without `VITE_API_URL` prefix working in production). Frontend points `VITE_API_URL` to the CloudFront domain — all API calls go through CloudFront.

2. **Two S3 buckets, both private**: The frontend bucket is accessed exclusively via CloudFront Origin Access Control (OAC). The uploads bucket is accessed exclusively by the Lightsail backend using IAM credentials — never public.

3. **ACM certificate**: Provisioned in `us-east-1` regardless of primary region (CloudFront requirement). `aws_acm_certificate_validation` blocks until DNS validation completes.

4. **PM2 on Lightsail**: Node.js process kept alive by PM2 (`ecosystem.config.cjs`). PM2 auto-restarts on crash. No Docker.

5. **No Lambda, no Lightsail Managed Database, no ECS**: Non-negotiable per CLAUDE.md.

### Lightsail Instance Setup

The Lightsail instance requires a one-time bootstrap script (user data or SSH provisioning) that Terraform triggers via a `null_resource` with a `remote-exec` provisioner:

```
1. Install Node.js 22 LTS (via NodeSource)
2. Install PM2 globally
3. Clone/pull the repo (or deploy via GitHub Actions artifact)
4. cd apps/backend && npm ci --production
5. npx prisma migrate deploy
6. pm2 start ecosystem.config.cjs
7. pm2 startup && pm2 save
```

Port 3000 opened in Lightsail firewall rule via Terraform resource `aws_lightsail_instance_public_ports`.

### Environment Variables Required (names only — no values)

**Lightsail backend instance:**
```
NODE_ENV
PORT
DATABASE_URL
JWT_SECRET
ANTHROPIC_API_KEY
CORS_ORIGIN
AWS_UPLOADS_BUCKET
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

**Frontend build (Vite, baked into static bundle at build time):**
```
VITE_API_URL
```

**GitHub Actions secrets (CI/CD pipeline):**
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
LIGHTSAIL_SSH_KEY
LIGHTSAIL_HOST
VITE_API_URL
DATABASE_URL
JWT_SECRET
ANTHROPIC_API_KEY
CORS_ORIGIN
AWS_UPLOADS_BUCKET
SUPABASE_URL
```

### Terraform File Structure

```
infrastructure/terraform/
├── main.tf              — provider config + top-level resource declarations
├── variables.tf         — input variable declarations
├── outputs.tf           — CloudFront domain, Lightsail IP, S3 bucket names
├── s3_frontend.tf       — frontend static site bucket + OAC + bucket policy
├── s3_uploads.tf        — private uploads bucket + IAM user/policy for backend access
├── cloudfront.tf        — CloudFront distribution + behaviors + ACM cert
├── lightsail.tf         — Lightsail instance + firewall rules + static IP
├── acm.tf               — ACM certificate + DNS validation records
└── terraform.tfvars.example — documented example values (no real secrets)
```

---

## § Backend Changes Required — F-24 (S3 File Migration)

### Overview

Amendment F-24 requires migrating CV and LinkedIn file storage from local disk (`uploads/cv/`, `uploads/linkedin/`) to a private AWS S3 bucket. Transcript files (post-screening) remain on disk — F-24 scope covers only CV and LinkedIn uploads and pre-screening reads.

The `cvFileName` and `linkedinFileName` fields on the `Candidate` model transition from storing a bare filename (e.g. `1715000000-resume.pdf`) to storing an S3 object key (e.g. `cv/1715000000-resume.pdf`). **No Prisma schema migration is required** — both representations fit in `String?`. The semantic change is handled entirely in the service layer.

### Files to Modify

| File | Change |
|------|--------|
| `apps/backend/src/middleware/upload.ts` | Replace disk storage for `cv` and `linkedin` fields with memory storage (buffer); remove disk destinations for cv/linkedin |
| `apps/backend/src/services/s3.service.ts` | **New file** — S3 client singleton + `uploadToS3()` + `getS3Stream()` + `getS3Buffer()` helpers |
| `apps/backend/src/controllers/candidates.controller.ts` | `createCandidateHandler`: after multer memory storage, call `s3.service.uploadToS3()` for each file; store returned S3 key instead of `file.filename` |
| `apps/backend/src/services/screening.service.ts` | Replace `path.resolve("uploads/cv", ...)` and `path.resolve("uploads/linkedin", ...)` with `getS3Buffer()` calls; pass `Buffer` to `parsePdf()` and a `Buffer`-to-string conversion for text files |
| `apps/backend/src/controllers/candidates.controller.ts` | `getCandidateFileHandler`: replace `fs.existsSync` + `res.sendFile` with `getS3Stream()` piped to response |
| `apps/backend/src/app.ts` | Remove `mkdirSync('uploads/cv', ...)` and `mkdirSync('uploads/linkedin', ...)` calls — disk directories no longer needed for cv/linkedin |
| `apps/backend/src/services/fileParser.service.ts` | Add `parsePdfBuffer(buffer: Buffer)` export alongside existing `parsePdf(filePath)`; `screening.service.ts` uses the buffer variant |

**Transcript upload (`uploads/transcript/`) is NOT migrated in F-24.** The transcript remains on local disk for post-screening reads in `postScreening.service.ts`. The `mkdirSync('uploads/transcript/')` call in `app.ts` stays.

### New File: `apps/backend/src/services/s3.service.ts`

Full interface specification:

```typescript
// S3 client — initialized once from env vars
// Uses @aws-sdk/client-s3 v3

const BUCKET = process.env.AWS_UPLOADS_BUCKET!;
const REGION = process.env.AWS_REGION!;

/**
 * Upload a file buffer to S3.
 * @param folder  "cv" | "linkedin"
 * @param file    Express.Multer.File (memoryStorage — file.buffer is populated)
 * @returns       S3 object key: "<folder>/<timestamp>-<originalname>"
 */
export async function uploadToS3(
  folder: "cv" | "linkedin",
  file: Express.Multer.File
): Promise<string>

/**
 * Stream an S3 object to a Node.js Readable stream.
 * Used by getCandidateFileHandler to pipe to res.
 * Throws on NoSuchKey or other S3 errors.
 */
export async function getS3Stream(key: string): Promise<NodeJS.ReadableStream>

/**
 * Download an S3 object as a Buffer.
 * Used by screening.service.ts before passing to parsePdfBuffer() or Buffer.toString().
 * Throws on NoSuchKey or other S3 errors.
 */
export async function getS3Buffer(key: string): Promise<Buffer>
```

Dependencies to add: `@aws-sdk/client-s3` (v3 — installed in `apps/backend`).

### Modified: `apps/backend/src/middleware/upload.ts`

- `cv` and `linkedin` fields: switch from `multer.diskStorage()` to `multer.memoryStorage()`. Remove the `destination` callback. The `filename` callback is also removed — the S3 key is computed in the controller.
- `transcriptStorage` (disk) remains **unchanged**.
- `uploadCandidateFiles` multer instance changes storage to `multer.memoryStorage()`.

### Modified: `apps/backend/src/controllers/candidates.controller.ts`

In `createCandidateHandler`:
```
// Before (disk storage):
cvFileName: cvFile?.filename ?? null

// After (S3):
cvFileName: cvFile ? await uploadToS3("cv", cvFile) : null
linkedinFileName: linkedinFile ? await uploadToS3("linkedin", linkedinFile) : null
```

In `getCandidateFileHandler`:
```
// Before (disk):
res.sendFile(result.filePath)

// After (S3):
const stream = await getS3Stream(result.fileName) // fileName is now the S3 key
res.setHeader("Content-Disposition", `inline; filename="${path.basename(result.fileName)}"`)
stream.pipe(res)
```

The `getCandidateFilePath` service function in `candidates.service.ts` returns `{ filePath, fileName }` — after F-24, `filePath` is deprecated; `fileName` is the S3 key. The controller should use `fileName` (the S3 key) for `getS3Stream()`.

### Modified: `apps/backend/src/services/screening.service.ts`

Replace local disk reads for cv and linkedin with S3 buffer reads:

```typescript
// Before:
const cvPath = path.resolve("uploads/cv", candidate.cvFileName);
cvText = await parsePdf(cvPath);          // or readTextFile(cvPath)

// After:
const cvBuffer = await getS3Buffer(candidate.cvFileName); // cvFileName is now S3 key
const ext = path.extname(candidate.cvFileName).toLowerCase();
cvText = ext === ".pdf"
  ? await parsePdfBuffer(cvBuffer)
  : cvBuffer.toString("utf-8");
```

Same pattern for `linkedinFileName`.

### Modified: `apps/backend/src/services/fileParser.service.ts`

Add a buffer-based variant for PDF parsing:

```typescript
/**
 * Parse a PDF from an in-memory Buffer.
 * Uses the same pdf-parse/lib/pdf-parse.js import (no self-test trigger).
 * Returns "" on error — non-fatal.
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<string>
```

The existing `parsePdf(filePath: string)` stays for backward compatibility (used by `postScreening.service.ts` for transcript files on disk).

### Test Updates Required

The following test files mock `multer` or reference `uploads/` paths and must be updated:

| Test file | Required change |
|-----------|----------------|
| `apps/backend/src/tests/candidates.test.ts` | Mock `@aws-sdk/client-s3` (or `s3.service.ts`) in upload tests; assert `cvFileName` is an S3 key (`cv/...`) not a bare filename |
| `apps/backend/src/tests/screening.test.ts` | Mock `getS3Buffer` instead of `fs.readFile`; mock `parsePdfBuffer` for PDF path |
| `apps/backend/src/tests/fileParser.test.ts` | Add test for `parsePdfBuffer(buffer)` returns non-empty string on valid PDF buffer |

Transcript upload tests in `postScreening.test.ts` do NOT change — transcript remains on disk.

### Environment Variables for F-24

```
AWS_UPLOADS_BUCKET   — name of the private S3 uploads bucket (provisioned by Terraform)
AWS_REGION           — AWS region where the uploads bucket lives (e.g. us-east-1)
AWS_ACCESS_KEY_ID    — IAM user credential with s3:PutObject + s3:GetObject on the uploads bucket
AWS_SECRET_ACCESS_KEY
```

The `@aws-sdk/client-s3` v3 client reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` from environment automatically when using `new S3Client({})` — no explicit credential passing needed if env vars are present.

---

## § API Contract (Delta)

Only new or changed endpoints. All prior endpoints remain unchanged (see `design-epic-2.md` through `design-epic-5.md`).

### Changed: `GET /candidates/:id/files/:type`

```
GET /candidates/:id/files/:type
  type: "cv" | "linkedin"
  Auth required: yes

BEFORE (Epic 2–5):
  Response: binary stream from local disk via res.sendFile()
  Mechanism: fs.existsSync() then res.sendFile(absolutePath)
  Error: 404 if file not on disk

AFTER (Epic 6, F-24):
  Response: binary stream from S3 via getS3Stream() piped to res
  Mechanism: S3 GetObject; stream piped to response
  Error: 404 if candidate not found or S3 key absent; 502 if S3 GetObject throws (network/auth error)
  Content-Disposition: inline; filename="<basename of S3 key>"
```

No request body change. No response body change. Client behavior is identical — the browser receives the same binary stream.

### No Other API Contract Changes

The F-24 migration is entirely internal to the backend. All existing endpoint signatures (`POST /candidates`, `POST /candidates/:id/pre-screen`, etc.) remain identical from the client perspective. The `cvFileName` and `linkedinFileName` fields in API responses will now contain S3 keys (`cv/1715000000-resume.pdf`) rather than bare filenames — the FE does not use these values directly (it calls the `/files/:type` endpoint), so no FE changes are required.

---

## § CI/CD Pipeline

### Repository Structure — New Files

```
.github/
└── workflows/
    ├── ci.yml        — runs on every push and PR to main
    └── deploy.yml    — runs on push to main after CI passes
```

### `ci.yml` — Continuous Integration

**Triggers:** `push` and `pull_request` targeting `main`

**Jobs:**

```yaml
jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: testdb
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
        working-directory: apps/backend
      - run: npx prisma migrate deploy
        working-directory: apps/backend
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
      - run: npm test
        working-directory: apps/backend
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/testdb
          JWT_SECRET: test-secret
          NODE_ENV: test
          # AWS S3 calls in tests must be mocked — no real bucket needed in CI
          AWS_UPLOADS_BUCKET: test-bucket
          AWS_REGION: us-east-1

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
        working-directory: apps/frontend
      - run: npm test
        working-directory: apps/frontend
        env:
          VITE_API_URL: http://localhost:3000
```

**Gate:** Both `test-backend` and `test-frontend` jobs must pass. `deploy.yml` depends on `ci.yml` completing successfully.

### `deploy.yml` — Deployment Pipeline

**Triggers:** `push` to `main` only (not PRs)

**Prerequisites:** CI must pass (via `needs: [ci]` or workflow dependency)

**Jobs:**

```yaml
jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci && npm run build
        working-directory: apps/frontend
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      - name: Sync to S3
        run: |
          aws s3 sync apps/frontend/dist/ s3://${{ secrets.FRONTEND_BUCKET }} \
            --delete \
            --cache-control "public,max-age=31536000,immutable" \
            --exclude "index.html"
          aws s3 cp apps/frontend/dist/index.html s3://${{ secrets.FRONTEND_BUCKET }}/index.html \
            --cache-control "no-cache,no-store,must-revalidate"
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Lightsail via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.LIGHTSAIL_HOST }}
          username: ubuntu
          key: ${{ secrets.LIGHTSAIL_SSH_KEY }}
          script: |
            cd /home/ubuntu/solo-mode
            git pull origin main
            cd apps/backend
            npm ci --production
            npx prisma migrate deploy
            pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs
            pm2 save
        env:
          NODE_ENV: production
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          CORS_ORIGIN: ${{ secrets.CORS_ORIGIN }}
          AWS_UPLOADS_BUCKET: ${{ secrets.AWS_UPLOADS_BUCKET }}
          AWS_REGION: ${{ secrets.AWS_REGION }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**Notes:**
- `index.html` gets `no-cache` so users always receive the latest SPA entrypoint.
- Hashed asset files (`main.abc123.js`) get `immutable` so CloudFront edge caches them indefinitely.
- `prisma migrate deploy` (not `dev`) — production safe; applies pending migrations without prompting.
- Env vars are passed to the remote script via SSH session environment. The Lightsail instance must have an `.env` file or `pm2 ecosystem.config.cjs` must read from process.env (preferred — no `.env` on server, all vars injected by PM2 env block set via CI).

### PM2 Ecosystem File

The DevOps agent must create `apps/backend/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [{
    name: "recruitment-api",
    script: "dist/index.js",
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
  }],
};
```

All secret env vars are set on the Lightsail instance system environment (via `/etc/environment` or `pm2 set env` during provisioning) — not stored in the ecosystem file.

---

## § Technology Decision Log

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| AWS S3 + CloudFront for frontend | Custom domain with HTTPS termination at edge requires CloudFront — S3 static hosting alone cannot serve HTTPS on custom domains. ACM certificates work with CloudFront without an ALB. | S3-only (no HTTPS on custom domain), Netlify (outside AWS stack constraint) |
| CloudFront `/api/*` behavior forwarding to Lightsail | Resolves [EPIC-2][LOW] known issue: FE file links were relative paths without API URL prefix. With all traffic through a single CloudFront domain, `VITE_API_URL` equals the CloudFront domain — no separate CORS origin or proxy config needed. | Separate API subdomain with its own ACM cert (more Terraform resources, more DNS records, harder CORS) |
| CloudFront Origin Access Control (OAC) over legacy OAI | OAC is the current AWS recommended pattern for S3 origins. OAI is deprecated for new distributions. | Origin Access Identity (OAI) — deprecated |
| Lightsail with PM2, no Docker | Required by CLAUDE.md — no Docker. Lightsail $3.50/mo is the cheapest persistent compute option on AWS that supports Node.js without cold starts. PM2 provides process supervision and auto-restart. | ECS Fargate (Docker, more expensive), Lambda (cold starts + 10-min timeout constraint for Anthropic calls), Lightsail Containers (Docker) |
| Supabase for PostgreSQL | Free tier, zero operational overhead, same `DATABASE_URL` connection string works in both local dev and production. No Prisma schema changes needed between environments. | RDS (not free tier), Lightsail Managed Database (excluded by CLAUDE.md), PlanetScale (MySQL, not PostgreSQL) |
| Two separate S3 buckets (frontend + uploads) | Separation of concerns and distinct permission models: frontend bucket is public-read via CloudFront OAC; uploads bucket is private with IAM-scoped access. Mixing them would require complex bucket policies and risk accidental public exposure of PII. | Single bucket with prefix-based policies (complex, error-prone), EFS mounted on Lightsail (not free tier) |
| multer-memoryStorage for cv/linkedin uploads (F-24) | Multer writes file to memory buffer; controller immediately calls `uploadToS3()` and discards the buffer. No temp file on Lightsail disk. Lightsail $3.50 instance has limited storage and files would be lost on instance rebuild. | multer-s3 (streams directly to S3 but couples multer to AWS SDK in middleware layer; harder to test) |
| @aws-sdk/client-s3 v3 (modular SDK) | Tree-shakable, ESM-compatible, smaller bundle than v2. Only `S3Client`, `PutObjectCommand`, and `GetObjectCommand` needed — avoids importing the entire v2 SDK. | aws-sdk v2 (CommonJS only, larger bundle, deprecated) |
| Terraform over CDK | Required by CLAUDE.md. Terraform's declarative HCL is more readable for DevOps agents than TypeScript CDK constructs. State file in S3 backend (optional) or local for MVP. | AWS CDK (TypeScript construct library; valid alternative but CLAUDE.md specifies Terraform) |
| GitHub Actions for CI/CD | Free for public repos; cost-effective for private repos within included minutes. Already in the repository. Integrates with GitHub secrets for credential management. | CircleCI, Jenkins (additional infrastructure), Lightsail CI (not a product) |
| ACM certificate in us-east-1 | CloudFront only supports ACM certificates created in us-east-1, regardless of the primary deployment region. This is an AWS constraint, not a preference. | No alternative — CloudFront mandates us-east-1 for ACM |
