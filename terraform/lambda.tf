# Both functions are packaged from src/<name>/ — run `npm install` in each
# directory before `terraform apply` so dependencies are included in the zip.

data "archive_file" "discord_interaction" {
  type        = "zip"
  source_dir  = "${path.module}/../src/discord-interaction"
  output_path = "${path.module}/build/discord-interaction.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_lambda_function" "discord_interaction" {
  function_name = "${var.project_name}-discord-interaction"
  role          = aws_iam_role.discord_interaction.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime
  timeout       = 10
  memory_size   = 256

  filename         = data.archive_file.discord_interaction.output_path
  source_code_hash = data.archive_file.discord_interaction.output_base64sha256

  environment {
    variables = {
      DISCORD_PUBLIC_KEY     = var.discord_public_key
      DISCORD_APPLICATION_ID = var.discord_application_id
      RAW_IMAGES_BUCKET      = aws_s3_bucket.raw_images.id
    }
  }

  tags = {
    Name = "${var.project_name}-discord-interaction"
  }
}

resource "aws_lambda_permission" "apigw_invoke_discord_interaction" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discord_interaction.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.discord.execution_arn}/*/*"
}

data "archive_file" "transcribe" {
  type        = "zip"
  source_dir  = "${path.module}/../src/transcribe"
  output_path = "${path.module}/build/transcribe.zip"
  excludes    = ["package-lock.json"]
}

resource "aws_lambda_function" "transcribe" {
  function_name = "${var.project_name}-transcribe"
  role          = aws_iam_role.transcribe.arn
  handler       = "index.handler"
  runtime       = var.lambda_runtime
  timeout       = 30
  memory_size   = 256

  filename         = data.archive_file.transcribe.output_path
  source_code_hash = data.archive_file.transcribe.output_base64sha256

  environment {
    variables = {
      WEBSITE_BUCKET             = local.website_bucket_name
      TRANSCRIPTS_PREFIX         = var.transcripts_prefix
      CLOUDFRONT_DISTRIBUTION_ID = local.website_cloudfront_distribution_id
    }
  }

  tags = {
    Name = "${var.project_name}-transcribe"
  }
}

resource "aws_lambda_permission" "s3_invoke_transcribe" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.transcribe.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.raw_images.arn
}

resource "aws_s3_bucket_notification" "raw_images" {
  bucket = aws_s3_bucket.raw_images.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.transcribe.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.s3_invoke_transcribe]
}
