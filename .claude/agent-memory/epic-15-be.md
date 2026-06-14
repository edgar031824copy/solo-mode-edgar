---
epic: 15
agent: be
status: complete
phase: 2.0-complete
outputs: [.github/workflows/deploy.yml]
---

Date: 2026-05-21
Epic: 15
Phase: 2.0-complete

## Routes Implemented

None — this epic contains no backend code changes.

## Database Models

None — no schema changes in this epic.

## Migrations

None.

## Test Results

None — no new code to test. Existing backend tests unchanged.

## Env Vars Required

CORS_ORIGIN (already present in secrets; this fix ensures it is sourced into the PM2 process environment on deploy)

## Change Made

File: .github/workflows/deploy.yml
Step: "Install production deps, migrate, restart PM2"
Added one line immediately before `pm2 restart ecosystem.config.cjs --update-env`:
  `set -a; source /etc/environment; set +a`

This sources /etc/environment into the current shell so that `--update-env` picks up CORS_ORIGIN and all other secrets written by the preceding "Write production environment variables" step, rather than inheriting the stale values from the original user_data bootstrap.

## Deviations from design.md

None — change matches the spec exactly.
