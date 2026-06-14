# ─── Uploads S3 Bucket ───────────────────────────────────────────────────────
# Private bucket for CV and LinkedIn file uploads (F-24).
# Accessed only by the Lightsail backend via IAM credentials.
# Never exposed to CloudFront or the public.

resource "aws_s3_bucket" "uploads" {
  bucket        = "${var.project_name}-uploads-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Disabled"
  }
}

# CORS configuration — allows the backend to PUT/GET objects from the Lightsail instance
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"] # Restricted to IAM — bucket is not public; CORS is belt-and-suspenders
    max_age_seconds = 3000
  }
}

# ─── IAM user for backend S3 access ──────────────────────────────────────────
# The solo-mode-backend-s3 IAM user is created manually by the company AWS admin
# (gha-aisdlc-deploy-role lacks iam:CreateUser). Credentials are passed in as
# var.backend_s3_access_key_id / var.backend_s3_secret_access_key and injected
# into the Lightsail instance via user_data. Required policy on the manually
# created user:
#   s3:PutObject, s3:GetObject, s3:DeleteObject on arn:aws:s3:::solo-mode-uploads-995603457880/*
#   s3:ListBucket on arn:aws:s3:::solo-mode-uploads-995603457880
