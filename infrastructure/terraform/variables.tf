variable "aws_region" {
  description = "AWS region for all resources (except ACM which is always us-east-1)"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Short project identifier used in resource names and tags"
  type        = string
  default     = "solo-mode"
}

variable "lightsail_blueprint" {
  description = "Lightsail instance blueprint (OS image)"
  type        = string
  default     = "ubuntu_22_04"
}

variable "lightsail_bundle" {
  description = "Lightsail instance bundle (size). nano_3_0 = $3.50/mo, 512 MB RAM"
  type        = string
  default     = "nano_3_0"
}

variable "domain_name" {
  description = "Custom domain for the CloudFront distribution (e.g. recruitment.example.com). Leave empty to use the CloudFront default *.cloudfront.net URL (no ACM cert needed)."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate in us-east-1 for var.domain_name. Required when domain_name is set. Leave empty when domain_name is empty."
  type        = string
  default     = ""
}

# Backend application env vars — injected into Lightsail user_data at provision time.
# In CI/CD (post-initial deploy), these are re-set via SSH during the deploy-backend job.
variable "database_url" {
  description = "Supabase PostgreSQL connection string (DATABASE_URL)"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}

variable "github_repo" {
  description = "GitHub repository to clone on Lightsail (e.g. org/repo)"
  type        = string
  default     = "gorillalogic/edgar-solo-mode"
}

variable "runner_registration_token" {
  description = "GitHub Actions runner registration token (valid 1 hour). Generate via: gh api -X POST repos/gorillalogic/edgar-solo-mode/actions/runners/registration-token --jq .token"
  type        = string
  sensitive   = true
}

variable "backend_s3_access_key_id" {
  description = "AWS access key ID for the solo-mode-backend-s3 IAM user (created manually by company AWS admin). Used by the Node.js backend to upload/read files from the uploads S3 bucket."
  type        = string
  sensitive   = true
}

variable "backend_s3_secret_access_key" {
  description = "AWS secret access key for the solo-mode-backend-s3 IAM user (created manually by company AWS admin)."
  type        = string
  sensitive   = true
}
