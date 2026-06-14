# ─── Frontend S3 Bucket ──────────────────────────────────────────────────────
# Private bucket — served exclusively via CloudFront Origin Access Control (OAC).
# Direct S3 access is blocked. Public access is blocked at the bucket level.

resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project_name}-frontend-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Disabled"
  }
}

# CloudFront Origin Access Control (OAC) — replaces deprecated OAI
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  description                       = "OAC for solo-mode frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Bucket policy — allows CloudFront (via OAC) to read objects
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })

  # Policy references the distribution ARN — wait for it to be created first
  depends_on = [aws_cloudfront_distribution.main]
}

# Current AWS account ID — used to make bucket names globally unique
data "aws_caller_identity" "current" {}
