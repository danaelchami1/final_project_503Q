resource "aws_sqs_queue" "invoice_dlq" {
  name = "${var.invoice_queue_name}-dlq"

  tags = merge(local.common_tags, {
    Name = "${var.invoice_queue_name}-dlq"
  })
}

resource "aws_sqs_queue" "invoice_queue" {
  name                       = var.invoice_queue_name
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.invoice_dlq.arn
    maxReceiveCount     = 5
  })

  tags = merge(local.common_tags, {
    Name = var.invoice_queue_name
  })
}

resource "aws_s3_bucket" "invoices" {
  bucket        = var.invoice_bucket_name
  force_destroy = true

  tags = merge(local.common_tags, {
    Name = var.invoice_bucket_name
  })
}

resource "aws_s3_bucket_versioning" "invoices" {
  bucket = aws_s3_bucket.invoices.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "invoices" {
  bucket = aws_s3_bucket.invoices.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_ses_email_identity" "invoice_sender" {
  email = var.ses_from_email
}

resource "aws_iam_role" "invoice_worker_role" {
  name = "shopcloud-${var.environment}-invoice-worker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_policy" "invoice_worker_policy" {
  name = "shopcloud-${var.environment}-invoice-worker-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = [
          aws_sqs_queue.invoice_queue.arn,
          aws_sqs_queue.invoice_dlq.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.invoices.arn,
          "${aws_s3_bucket.invoices.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "invoice_worker_policy_attach" {
  role       = aws_iam_role.invoice_worker_role.name
  policy_arn = aws_iam_policy.invoice_worker_policy.arn
}
