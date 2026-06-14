# ─── Lightsail Instance ──────────────────────────────────────────────────────
# $3.50/mo — nano_3_0 (512 MB RAM, 20 GB SSD, 1 vCPU)
# Node.js 22 LTS + PM2 — bootstrapped via user_data on first boot.

locals {
  # CORS_ORIGIN is the CloudFront HTTPS URL — computed after distribution is created.
  cors_origin = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"

  # S3 uploads bucket credentials — IAM user created manually by company AWS admin
  backend_s3_access_key_id     = var.backend_s3_access_key_id
  backend_s3_secret_access_key = var.backend_s3_secret_access_key

  # Inline bootstrap script — avoids templatefile() shell-escaping issues.
  # Terraform interpolates ${} expressions here; shell vars use single-quoted
  # strings or are constructed via printf to avoid ambiguity.
  user_data_script = <<-BOOTSTRAP
    #!/bin/bash
    set -euo pipefail
    exec > /var/log/solo-mode-setup.log 2>&1

    echo "=== solo-mode Lightsail bootstrap starting ==="
    date

    # 1. Install Node.js 22 LTS
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs git

    # 2. Install PM2
    npm install -g pm2

    # 3. Clone the repository
    git clone https://github.com/${var.github_repo}.git /home/ubuntu/solo-mode

    # 4. Write environment variables
    cat >> /etc/environment <<ENV
    NODE_ENV=production
    PORT=3000
    DATABASE_URL=${var.database_url}
    JWT_SECRET=${var.jwt_secret}
    ANTHROPIC_API_KEY=${var.anthropic_api_key}
    CORS_ORIGIN=${local.cors_origin}
    AWS_UPLOADS_BUCKET=${aws_s3_bucket.uploads.id}
    AWS_REGION=${var.aws_region}
    AWS_ACCESS_KEY_ID=${local.backend_s3_access_key_id}
    AWS_SECRET_ACCESS_KEY=${local.backend_s3_secret_access_key}
    ENV

    # Export for this session
    export NODE_ENV=production
    export PORT=3000
    export DATABASE_URL="${var.database_url}"
    export JWT_SECRET="${var.jwt_secret}"
    export ANTHROPIC_API_KEY="${var.anthropic_api_key}"
    export CORS_ORIGIN="${local.cors_origin}"
    export AWS_UPLOADS_BUCKET="${aws_s3_bucket.uploads.id}"
    export AWS_REGION="${var.aws_region}"
    export AWS_ACCESS_KEY_ID="${local.backend_s3_access_key_id}"
    export AWS_SECRET_ACCESS_KEY="${local.backend_s3_secret_access_key}"

    # 5. Build backend
    cd /home/ubuntu/solo-mode/apps/backend
    npm ci
    npm run build

    # 6. Run Prisma migrations
    npx prisma migrate deploy

    # 7. Start PM2
    pm2 start ecosystem.config.cjs
    env PATH="$PATH:/usr/bin" pm2 startup systemd -u ubuntu --hp /home/ubuntu
    pm2 save

    # 8. Register GitHub Actions self-hosted runner
    RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest \
      | grep tag_name | cut -d '"' -f 4 | sed 's/^v//')
    mkdir -p /home/ubuntu/actions-runner
    curl -fsSL \
      "https://github.com/actions/runner/releases/download/v$${RUNNER_VERSION}/actions-runner-linux-x64-$${RUNNER_VERSION}.tar.gz" \
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

    echo "=== solo-mode Lightsail bootstrap complete ==="
    date
  BOOTSTRAP
}

resource "aws_lightsail_instance" "api" {
  name              = "${var.project_name}-api"
  availability_zone = "${var.aws_region}a"
  blueprint_id      = var.lightsail_blueprint
  bundle_id         = var.lightsail_bundle
  user_data         = local.user_data_script

  tags = {
    project = "solo-mode"
    role    = "backend-api"
  }

  # Prevent instance recreation when runner_registration_token changes.
  # The token is embedded in user_data only for first-boot provisioning.
  # Terraform cannot patch user_data on a running instance anyway —
  # changing it forces a destroy+recreate which wipes the running app.
  lifecycle {
    ignore_changes = [user_data]
  }
}

# Static IP — keeps the Lightsail IP stable across instance stop/start
resource "aws_lightsail_static_ip" "api" {
  name = "${var.project_name}-api-ip"
}

resource "aws_lightsail_static_ip_attachment" "api" {
  static_ip_name = aws_lightsail_static_ip.api.id
  instance_name  = aws_lightsail_instance.api.id
}

# ─── Firewall rules ──────────────────────────────────────────────────────────
# Port 3000 — backend API (CloudFront /api/* forwards here)
# Port 22   — SSH for GitHub Actions deployments

resource "aws_lightsail_instance_public_ports" "api" {
  instance_name = aws_lightsail_instance.api.name

  port_info {
    protocol  = "tcp"
    from_port = 3000
    to_port   = 3000
  }

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
  }
}
