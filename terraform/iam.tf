data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- discord-interaction Lambda role ---
# Only needs to write photos into the raw-images bucket.
resource "aws_iam_role" "discord_interaction" {
  name               = "${var.project_name}-discord-interaction"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "discord_interaction_logs" {
  role       = aws_iam_role.discord_interaction.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "discord_interaction" {
  statement {
    sid       = "PutRawImages"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.raw_images.arn}/*"]
  }
}

resource "aws_iam_role_policy" "discord_interaction" {
  name   = "${var.project_name}-discord-interaction"
  role   = aws_iam_role.discord_interaction.id
  policy = data.aws_iam_policy_document.discord_interaction.json
}

# --- transcribe Lambda role ---
# Reads raw photos, calls Textract, writes transcripts into the website
# bucket's transcripts/ prefix only, and invalidates just that distribution.
resource "aws_iam_role" "transcribe" {
  name               = "${var.project_name}-transcribe"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "transcribe_logs" {
  role       = aws_iam_role.transcribe.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "transcribe" {
  statement {
    sid       = "ReadRawImages"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.raw_images.arn}/*"]
  }

  statement {
    sid       = "WriteTranscripts"
    actions   = ["s3:PutObject"]
    resources = [local.website_transcripts_arn]
  }

  statement {
    sid       = "DetectHandwriting"
    actions   = ["textract:DetectDocumentText"]
    resources = ["*"] # Textract does not support resource-level permissions
  }

  statement {
    sid       = "InvalidateWebsiteDistribution"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [local.website_cloudfront_distribution_arn]
  }
}

resource "aws_iam_role_policy" "transcribe" {
  name   = "${var.project_name}-transcribe"
  role   = aws_iam_role.transcribe.id
  policy = data.aws_iam_policy_document.transcribe.json
}
