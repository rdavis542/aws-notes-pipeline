data "aws_caller_identity" "current" {}

# Reads outputs from the aws-static-site project's state so this project
# never hardcodes the website bucket name or CloudFront distribution ID.
data "terraform_remote_state" "static_site" {
  backend = "s3"

  config = {
    bucket = var.website_state_bucket
    key    = var.website_state_key
    region = var.website_state_region
  }
}
