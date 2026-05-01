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

data "archive_file" "invoice_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../services/invoice-worker"
  output_path = "${path.module}/build/invoice-worker-lambda.zip"
  excludes = [
    "invoices",
    "Dockerfile",
    ".dockerignore",
    "README.md"
  ]
}

resource "aws_lambda_function" "invoice_processor" {
  function_name = "shopcloud-${var.environment}-invoice-processor"
  description   = "Processes invoice events from SQS and generates invoice PDFs"
  role          = aws_iam_role.invoice_worker_role.arn
  runtime       = "nodejs20.x"
  handler       = "src/lambda.handler"

  filename         = data.archive_file.invoice_lambda_zip.output_path
  source_code_hash = data.archive_file.invoice_lambda_zip.output_base64sha256

  timeout     = var.invoice_lambda_timeout_seconds
  memory_size = var.invoice_lambda_memory_mb

  environment {
    variables = {
      INVOICE_BUCKET_NAME       = aws_s3_bucket.invoices.bucket
      SES_FROM_EMAIL            = var.ses_from_email
      INVOICE_S3_UPLOAD_ENABLED = "true"
      INVOICE_SES_SEND_ENABLED  = "true"
    }
  }

  depends_on = [aws_iam_role_policy_attachment.invoice_worker_policy_attach]

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-invoice-processor"
  })
}

resource "aws_cloudwatch_log_group" "invoice_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.invoice_processor.function_name}"
  retention_in_days = 14

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-invoice-lambda-logs"
  })
}

resource "aws_lambda_event_source_mapping" "invoice_queue_to_lambda" {
  event_source_arn = aws_sqs_queue.invoice_queue.arn
  function_name    = aws_lambda_function.invoice_processor.arn
  batch_size       = var.invoice_lambda_batch_size
  enabled          = var.enable_invoice_lambda_sqs_consumer
}
