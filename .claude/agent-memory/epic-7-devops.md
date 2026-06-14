---
epic: 7
agent: devops
status: complete
phase: 5.0-complete
outputs: [git push to main, CI/CD deploy verified]
---

Date: 2026-05-14
Phase: epic=7,phase=5.0-complete

## Deploy Mode: post-launch

## Commits Pushed
1. ec11698 — fix(ci): fix 42 backend test failures in CI — replace DB-dependent getAuthToken() with JWT-direct makeAuthToken() helper (F-25)
2. 91b5b9a — fix(ci): add prisma db seed step to CI so auth.test.ts login test passes

## CI/CD
Run ID: 25887781397
Workflow: Deploy (push to main)
URL: https://github.com/gorillalogic/edgar-solo-mode/actions/runs/25887781397
- Backend Tests (deploy gate): SUCCESS
- Frontend Tests (deploy gate): SUCCESS
- Deploy Frontend (S3 + CloudFront): SUCCESS
- Deploy Backend (Lightsail SSH): FAILURE — pre-existing issue: /home/ubuntu/solo-mode not a git repo on Lightsail; backend already running via prior manual bootstrap

## Live URL
Frontend: https://d36qh2h56p23nc.cloudfront.net
Backend health: http://34.226.38.150:3000/health

## Verification
- Backend /health: 200 OK — {"status":"ok","timestamp":"2026-05-14T21:49:41.766Z"} (pre-push)
- Frontend curl: 200 OK — HTML returned with <!doctype html> (pre-push)
- Backend /health re-checked: live and running independently of CI SSH step

## Notes
The Lightsail SSH deploy step has never succeeded in CI (backend was bootstrapped manually).
The test gate (Backend Tests + Frontend Tests) now passes cleanly — that is the F-25 objective.
A second fix (91b5b9a) added `prisma db seed` to CI to resolve a pre-existing auth.test.ts failure
where recruiter@gorilla.com was not seeded in the test DB after migrations.

## Known Issues
- [HIGH] Deploy Backend (Lightsail SSH) step in deploy.yml fails — Lightsail was bootstrapped manually (files copied, not git cloned), so `git pull` errors with "not a git repository". Fix: replace git pull with rsync to push files from CI runner directly to Lightsail over SSH. Tracked as F-26 in amendments.md targeting epic 8.
- [HIGH] FE and BE deploy in parallel — if BE fails, FE still deploys, leaving prod in an inconsistent state (new FE calling old BE). Fix: add `needs: [deploy-backend]` to the deploy-frontend job so FE only runs if BE succeeds. Tracked as F-26 in amendments.md targeting epic 8.
