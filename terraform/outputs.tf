output "interactions_endpoint_url" {
  description = "URL to register as the Discord Application's Interactions Endpoint URL"
  value       = "${aws_apigatewayv2_api.discord.api_endpoint}/interactions"
}

output "raw_images_bucket_name" {
  description = "S3 bucket that raw phone photos land in"
  value       = aws_s3_bucket.raw_images.id
}

output "discord_interaction_function_name" {
  description = "Lambda function name for the Discord interaction handler"
  value       = aws_lambda_function.discord_interaction.function_name
}

output "transcribe_function_name" {
  description = "Lambda function name for the Textract transcription handler"
  value       = aws_lambda_function.transcribe.function_name
}

output "website_bucket_name" {
  description = "Website S3 bucket (from aws-static-site state) that transcripts are written into"
  value       = local.website_bucket_name
}
