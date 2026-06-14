#!/bin/bash
# setup-lightsail.sh — Lightsail first-boot bootstrap via cloud-init user_data.
# Terraform templatefile() renders this file — Terraform vars use ${var} syntax.
# Shell vars use $${var} syntax so Terraform does not try to expand them.

set -euo pipefail
exec > /var/log/solo-mode-setup.log 2>&1

echo "=== solo-mode Lightsail bootstrap starting ==="
date

# ─── 1. Install Node.js 22 LTS ───────────────────────────────────────────────
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

node --version
npm --version

# ─── 2. Install PM2 ──────────────────────────────────────────────────────────
npm install -g pm2
pm2 --version

# ─── 3. Clone the repository ─────────────────────────────────────────────────
REPO_DIR="/home/ubuntu/solo-mode"
if [ -d "$${REPO_DIR}" ]; then
  echo "Repo already exists — pulling latest"
  cd "$${REPO_DIR}" && git pull origin main
else
  git clone "https://github.com/${github_repo}.git" "$${REPO_DIR}"
fi

# ─── 4. Write environment variables to /etc/environment ──────────────────────
# Terraform templatefile() substitutes ${...} values at plan time.
# printf avoids heredoc quoting conflicts.
printf 'NODE_ENV=%s\n' "${node_env}" >> /etc/environment
printf 'PORT=%s\n' "${port}" >> /etc/environment
printf 'DATABASE_URL=%s\n' "${database_url}" >> /etc/environment
printf 'JWT_SECRET=%s\n' "${jwt_secret}" >> /etc/environment
printf 'ANTHROPIC_API_KEY=%s\n' "${anthropic_api_key}" >> /etc/environment
printf 'CORS_ORIGIN=%s\n' "${cors_origin}" >> /etc/environment
printf 'AWS_UPLOADS_BUCKET=%s\n' "${aws_uploads_bucket}" >> /etc/environment
printf 'AWS_REGION=%s\n' "${aws_region}" >> /etc/environment
printf 'AWS_ACCESS_KEY_ID=%s\n' "${aws_access_key_id}" >> /etc/environment
printf 'AWS_SECRET_ACCESS_KEY=%s\n' "${aws_secret_access_key}" >> /etc/environment

# Export vars for the current shell session
export NODE_ENV="${node_env}"
export PORT="${port}"
export DATABASE_URL="${database_url}"
export JWT_SECRET="${jwt_secret}"
export ANTHROPIC_API_KEY="${anthropic_api_key}"
export CORS_ORIGIN="${cors_origin}"
export AWS_UPLOADS_BUCKET="${aws_uploads_bucket}"
export AWS_REGION="${aws_region}"
export AWS_ACCESS_KEY_ID="${aws_access_key_id}"
export AWS_SECRET_ACCESS_KEY="${aws_secret_access_key}"

# ─── 5. Install backend dependencies and build ───────────────────────────────
cd "$${REPO_DIR}/apps/backend"
npm ci
npm run build

# ─── 6. Run Prisma migrations ────────────────────────────────────────────────
npx prisma migrate deploy

# ─── 7. Start PM2 ────────────────────────────────────────────────────────────
pm2 start ecosystem.config.cjs
pm2 startup ubuntu -u ubuntu --hp /home/ubuntu
pm2 save

echo "=== solo-mode Lightsail bootstrap complete ==="
date
