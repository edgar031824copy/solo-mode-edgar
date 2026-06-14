# ─── CloudFront Distribution ─────────────────────────────────────────────────
# Two behaviors:
#   /* (default)  → frontend S3 bucket (OAC)
#   /api/*        → Lightsail backend on port 3000 (strips /api prefix via CF Function)
#
# In default URL mode:  uses cloudfront_default_certificate = true
# In custom domain mode: uses ACM cert ARN + domain alias

# CloudFront Function — strip /api prefix before forwarding to Lightsail
# /api/candidates → /candidates (Express routes are mounted at root, not /api)
resource "aws_cloudfront_function" "api_rewrite" {
  name    = "${var.project_name}-api-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Strip /api prefix before forwarding to Lightsail backend"
  publish = true
  code    = <<-EOF
    function handler(event) {
      var request = event.request;
      request.uri = request.uri.replace(/^\/api/, '') || '/';
      return request;
    }
  EOF
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.project_name} — SPA + API proxy"
  price_class         = "PriceClass_100" # US, Canada, Europe edge locations only

  # Custom domain aliases — only set when domain_name is provided
  aliases = var.domain_name != "" ? [var.domain_name] : []

  # ─── Origin 1: frontend S3 bucket (OAC) ────────────────────────────────────
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3FrontendOrigin"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ─── Origin 2: Lightsail backend (port 3000) ───────────────────────────────
  # CloudFront does not accept raw IP addresses as origin domain_name.
  # We use nip.io — a wildcard DNS service that maps <ip>.nip.io → <ip>.
  # This gives CloudFront a valid FQDN while still routing to our Lightsail IP.
  origin {
    # nip.io format: <a>.<b>.<c>.<d>.nip.io → resolves to <a>.<b>.<c>.<d>
    domain_name = "${aws_lightsail_static_ip.api.ip_address}.nip.io"
    origin_id   = "LightsailBackendOrigin"

    custom_origin_config {
      http_port              = 3000
      https_port             = 443
      # Lightsail does not have a TLS cert — CloudFront → Lightsail is plain HTTP (internal)
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # Claude API calls (pre-screen, post-screen) can take 30-60s on real CVs.
      # Default is 30s which causes 504s. 60s is the AWS maximum without a support request.
      origin_read_timeout = 60
    }
  }

  # ─── Behavior 1: /api/* → Lightsail ───────────────────────────────────────
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    target_origin_id = "LightsailBackendOrigin"

    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    # Do not cache API responses
    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Origin", "Content-Type", "Accept", "Content-Length"]
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0

    # CF Function rewrites /api/foo → /foo before forwarding to origin
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_rewrite.arn
    }
  }

  # ─── Behavior 2 (default): /* → S3 frontend ───────────────────────────────
  default_cache_behavior {
    target_origin_id       = "S3FrontendOrigin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 31536000
  }

  # ─── Custom error responses — required for React Router ───────────────────
  # S3 returns 403 for paths like /candidates/123 (no such key in bucket).
  # CloudFront intercepts and serves index.html with 200 so React Router handles routing.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  # ─── Viewer certificate ────────────────────────────────────────────────────
  viewer_certificate {
    cloudfront_default_certificate = var.domain_name == ""
    acm_certificate_arn            = var.domain_name != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.domain_name != "" ? "sni-only" : null
    minimum_protocol_version       = var.domain_name != "" ? "TLSv1.2_2021" : "TLSv1"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    project = "solo-mode"
  }
}
