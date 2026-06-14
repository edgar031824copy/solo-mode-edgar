terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "gorilla-tf-state-995603457880"
    key    = "solo-mode/terraform.tfstate"
    region = "us-east-1"
  }
}

# Primary provider — all resources except ACM (CloudFront mandates us-east-1 for ACM)
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      project = "solo-mode"
    }
  }
}

# Dedicated us-east-1 provider for ACM (CloudFront requirement)
# Used only when custom domain mode is active (var.domain_name != "")
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      project = "solo-mode"
    }
  }
}
