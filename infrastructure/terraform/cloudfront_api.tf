# ─── API CloudFront Distribution ─────────────────────────────────────────────
# Provides an HTTPS termination layer in front of the Lightsail backend.
# VITE_API_URL is updated to https://<this distribution domain> after apply.
# The React frontend hits this HTTPS endpoint — no mixed-content block.
#
# Origin: Lightsail static IP via nip.io (same pattern as cloudfront.tf).
# No path rewriting — Express routes are mounted at root, frontend calls /auth/login etc.
# CachingDisabled policy ensures no responses are cached.
# AllViewerExceptHostHeader origin request policy strips the Host header so Express
# does not receive the CloudFront domain as Host (which could confuse routing).

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.project_name} — API HTTPS proxy (F-32)"
  price_class     = "PriceClass_100"

  origin {
    domain_name = "${aws_lightsail_static_ip.api.ip_address}.nip.io"
    origin_id   = "LightsailAPIOrigin"

    custom_origin_config {
      http_port              = 3000
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      # Match the 60s read timeout in the main distribution (Claude calls can take 30-60s)
      origin_read_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id       = "LightsailAPIOrigin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    # CachingDisabled managed policy — ID is stable across all AWS accounts/regions
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

    # AllViewerExceptHostHeader — forwards all headers except Host to origin.
    # Required: prevents the CloudFront *.cloudfront.net Host header from reaching Express.
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1"
  }

  tags = {
    project = "solo-mode"
  }
}
