# Review Report — Epic 8

**Date:** 2026-05-14
**Phase:** 3.0-complete
**Reviewer:** TechLead Agent
**Scope:** CI/CD-only fix (Amendment F-26). Single file changed: `.github/workflows/deploy.yml`.

---

## Summary

| Category | Count |
|----------|-------|
| Issues found | 0 |
| Issues fixed (prior epics) | 0 (all prior [HIGH]/[MEDIUM] issues were resolved by Epic 7) |
| Tests passed | 174 (120 BE + 54 FE) |
| Tests failed | 0 |
| Sign-off | APPROVED |

---

## Prior Issue Fixes

No [HIGH] or [MEDIUM] known issues carried forward from prior TechLead summaries into Epic 8.

The full issue history from prior TechLead summaries:
- [EPIC-1][LOW] FE: LoginPage.tsx bare axios — FIXED in Epic 2
- [EPIC-2][LOW] FE: CandidateDetailsCard file links — FIXED in Epic 4
- [EPIC-3][HIGH] BE: pdf-parse self-test ENOENT — FIXED in Epic 4
- [EPIC-3][HIGH] BE: LinkedIn PDF reads as text — FIXED in Epic 4
- [EPIC-4][LOW] BE: Missing prompt caching on postScreening system prompt — FIXED in Epic 5
- [EPIC-6][HIGH] CI: 401 on protected routes in CI — FIXED in Epic 7
- [EPIC-6][LOW] BE: getCandidateFilePath() dead code — tracked as [EPIC-7][LOW], not fixed (LOW, not blocking)
- [EPIC-6][LOW] BE: AWS SDK v3 NodeVersionSupportWarning — tracked as [EPIC-7][LOW], not fixed (LOW, acceptable)

No [HIGH] or [MEDIUM] items remain unfixed entering Epic 8.

---

## Static Review — deploy.yml Against Design Spec

### Change 1: Replace `appleboy/ssh-action` with rsync + native SSH in `deploy-backend`

| Check | Result |
|-------|--------|
| No `appleboy/ssh-action` reference remains | PASS — `grep appleboy` returns empty |
| No `git pull` reference remains | PASS — `grep "git pull"` returns empty |
| Step 1 "Write SSH key and rsync backend files" present | PASS |
| SSH key written to `~/.ssh/lightsail_key` with `chmod 600` | PASS |
| rsync flags: `-avz --delete` | PASS |
| rsync `-e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/lightsail_key"` | PASS |
| Source path: `apps/backend/` (trailing slash, copies contents) | PASS |
| Destination: `ubuntu@${{ secrets.LIGHTSAIL_HOST }}:/home/ubuntu/solo-mode/apps/backend/` | PASS |
| Step 2 "Run post-deploy commands on Lightsail" present | PASS |
| SSH heredoc opens with `<< 'ENDSSH'` | PASS |
| `set -e` inside heredoc | PASS |
| All 9 required env var exports present | PASS — NODE_ENV, DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, CORS_ORIGIN, AWS_UPLOADS_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY |
| `cd /home/ubuntu/solo-mode/apps/backend` | PASS |
| `npm ci --omit=dev` | PASS |
| `npm run build` | PASS |
| `npx prisma generate` | PASS |
| `npx prisma migrate deploy` | PASS |
| `pm2 restart ecosystem.config.cjs --update-env \|\| pm2 start ecosystem.config.cjs` | PASS |
| `pm2 save` | PASS |
| `echo "Backend deploy complete"` | PASS |
| ENDSSH terminator at correct column after YAML block scalar stripping | PASS — see YAML analysis below |

**YAML heredoc terminator analysis:**

The `run: |` block indentation is 8 spaces. YAML block scalar determines the strip level from the first non-empty content line (the `ssh` command at 10 spaces), so 10 spaces are stripped from all lines. After stripping:
- Body lines (12 spaces raw) become 2-space-indented shell commands
- `ENDSSH` (10 spaces raw) becomes column-0 in the shell script

This is the correct behavior for a `<<` (non-dash) heredoc — the terminator must appear at column 0. The implementation is correct.

### Change 2: Gate `deploy-frontend` on `deploy-backend`

| Check | Result |
|-------|--------|
| `deploy-frontend` `needs:` includes `deploy-backend` | PASS — line 101: `needs: [test-backend, test-frontend, deploy-backend]` |
| `deploy-backend` `needs:` unchanged — `[test-backend, test-frontend]` | PASS — line 156 |
| No other jobs modified | PASS |

### YAML Syntax Validation

No tab characters found (YAML requires spaces). Structure verified by Python character-level analysis. All YAML constructs well-formed.

### Security Review

| Check | Result |
|-------|--------|
| No API keys or secrets hardcoded in source | PASS — all secrets referenced via `${{ secrets.* }}` |
| SSH private key not committed to repo | PASS — key is written at runtime from `LIGHTSAIL_SSH_KEY` secret |
| `StrictHostKeyChecking=no` acceptable for CI context | ACCEPTABLE — standard CI pattern; host key verification would require pre-populating known_hosts |

---

## Test Results

### Backend Tests

```
Test Files  14 passed (14)
Tests       120 passed (120)
Duration    100.35s
```

No regressions. All 120 tests carry forward cleanly from Epic 7. The AWS SDK v3 NodeVersionSupportWarning is emitted (tracked as [EPIC-7][LOW]) — this is a runtime warning, not a test failure.

### Frontend Tests

```
Test Files  11 passed (11)
Tests       54 passed (54)
Duration    5.90s
```

No regressions. All 54 tests carry forward cleanly from Epic 7.

### Combined

| Suite | Files | Tests | Pass | Fail |
|-------|-------|-------|------|------|
| Backend (Vitest) | 14 | 120 | 120 | 0 |
| Frontend (Vitest) | 11 | 54 | 54 | 0 |
| **Total** | **25** | **174** | **174** | **0** |

---

## BRD Functional Coverage

Epic 8 is an amendments-only epic (F-26 from `amendments.md`). No BRD F-IDs (F-01 through F-23) are in scope. All prior BRD F-IDs remain satisfied — no application code was changed.

| Amendment | Description | Status |
|-----------|-------------|--------|
| F-26 | Fix deploy.yml: rsync replaces git pull; FE gated on BE success | PASS — both changes implemented per spec |

---

## Known Limitations / Deferred Items

- [LOW] The `ENDSSH` heredoc secrets (DATABASE_URL, JWT_SECRET, etc.) are interpolated by the GitHub Actions runner before SSH. This means the secret values appear as literal strings in the command sent to the remote — they are not exposed in CI logs (GitHub Actions masks secrets), but they do traverse the network as part of the SSH payload. This is the standard and accepted pattern for secret injection into SSH heredocs; no alternative exists without an agent on the remote side.
- [LOW] `StrictHostKeyChecking=no` is used for both rsync and the post-deploy SSH step. This suppresses host key verification. For a production-grade deployment, the Lightsail host key should be stored in a GitHub secret and added to `~/.ssh/known_hosts` before connecting. Acceptable for current scale; address if compliance requirements tighten.

---

## Sign-off

**APPROVED.** Both deploy.yml changes conform exactly to `docs/design-epic-8.md § CI/CD Pipeline Fix`. No application code was changed. All 174 tests pass with 0 failures. No [HIGH] or [MEDIUM] issues found or carried forward.
