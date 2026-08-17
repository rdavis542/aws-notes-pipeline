variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name prefix used for resource naming"
  type        = string
  default     = "notes-pipeline"
}

variable "discord_public_key" {
  description = "Discord Application's Public Key, used to verify interaction request signatures (Developer Portal > General Information)"
  type        = string
  sensitive   = true
}

variable "raw_image_retention_days" {
  description = "Number of days to retain raw uploaded photos before S3 expires them"
  type        = number
  default     = 30
}

variable "transcripts_prefix" {
  description = "Key prefix in the website bucket where transcript .txt files are written"
  type        = string
  default     = "transcripts/"
}

variable "lambda_runtime" {
  description = "Node.js runtime used by both Lambda functions"
  type        = string
  default     = "nodejs20.x"
}

variable "website_state_bucket" {
  description = "S3 bucket holding the aws-static-site project's Terraform state"
  type        = string
  default     = "tf-state-replication-source-350726165848"
}

variable "website_state_key" {
  description = "State file key for the aws-static-site project, within website_state_bucket"
  type        = string
  default     = "terraform-aws-static-site.tfstate"
}

variable "website_state_region" {
  description = "Region of the S3 backend holding the aws-static-site project's Terraform state"
  type        = string
  default     = "us-east-2"
}
