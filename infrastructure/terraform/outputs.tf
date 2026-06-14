output "cloudfront_domain" {
  description = "CloudFront distribution domain name (use this as your frontend URL in default URL mode)"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidations in CI/CD)"
  value       = aws_cloudfront_distribution.main.id
}

output "lightsail_ip" {
  description = "Static public IP of the Lightsail backend instance"
  value       = aws_lightsail_static_ip.api.ip_address
}

output "frontend_bucket" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.id
}

output "uploads_bucket" {
  description = "Name of the private uploads S3 bucket (used by backend for F-24 file storage)"
  value       = aws_s3_bucket.uploads.id
}


output "live_url" {
  description = "Public frontend URL. In custom domain mode this is https://<domain_name>. In default URL mode this is https://<cloudfront_domain>."
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "api_cloudfront_domain" {
  description = "API CloudFront distribution domain — use as VITE_API_URL base (https://<domain>)"
  value       = aws_cloudfront_distribution.api.domain_name
}
