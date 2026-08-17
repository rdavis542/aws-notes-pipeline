locals {
  raw_images_bucket_name = "${var.project_name}-raw-${data.aws_caller_identity.current.account_id}"

  website_bucket_name     = data.terraform_remote_state.static_site.outputs.s3_bucket_name
  website_bucket_arn      = "arn:aws:s3:::${local.website_bucket_name}"
  website_transcripts_arn = "${local.website_bucket_arn}/${var.transcripts_prefix}*"

  website_cloudfront_distribution_id  = data.terraform_remote_state.static_site.outputs.cloudfront_distribution_id
  website_cloudfront_distribution_arn = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${local.website_cloudfront_distribution_id}"
}
