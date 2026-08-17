# S3 bucket for raw phone-photo uploads, landed by the Discord interaction Lambda
resource "aws_s3_bucket" "raw_images" {
  bucket = local.raw_images_bucket_name

  tags = {
    Name = local.raw_images_bucket_name
  }
}

resource "aws_s3_bucket_public_access_block" "raw_images" {
  bucket = aws_s3_bucket.raw_images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_images" {
  bucket = aws_s3_bucket.raw_images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Raw photos are transient — they only need to live long enough for the
# transcribe Lambda to process them once.
resource "aws_s3_bucket_lifecycle_configuration" "raw_images" {
  bucket = aws_s3_bucket.raw_images.id

  rule {
    id     = "expire-raw-images"
    status = "Enabled"

    filter {}

    expiration {
      days = var.raw_image_retention_days
    }
  }
}
