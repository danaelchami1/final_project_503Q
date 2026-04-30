resource "aws_sns_topic" "alarm_notifications" {
  count = var.enable_alarm_notifications ? 1 : 0

  name = "shopcloud-${var.environment}-alarm-notifications"
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "alarm_notifications_email" {
  for_each = var.enable_alarm_notifications ? toset(var.alarm_notification_emails) : toset([])

  topic_arn = aws_sns_topic.alarm_notifications[0].arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  effective_alarm_topic_arn = var.alarm_notification_topic_arn != "" ? var.alarm_notification_topic_arn : (
    var.enable_alarm_notifications ? aws_sns_topic.alarm_notifications[0].arn : ""
  )
}

resource "aws_cloudwatch_metric_alarm" "invoice_queue_depth_high" {
  alarm_name          = "shopcloud-${var.environment}-invoice-queue-depth-high"
  alarm_description   = "Invoice queue depth is too high, indicating processing lag."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.invoice_queue_depth_alarm_threshold
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []
  ok_actions          = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []

  dimensions = {
    QueueName = aws_sqs_queue.invoice_queue.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "invoice_dlq_depth_high" {
  alarm_name          = "shopcloud-${var.environment}-invoice-dlq-depth-high"
  alarm_description   = "Invoice DLQ contains messages, indicating failed processing."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.invoice_dlq_depth_alarm_threshold
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []
  ok_actions          = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []

  dimensions = {
    QueueName = aws_sqs_queue.invoice_dlq.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "invoice_queue_oldest_message_age_high" {
  alarm_name          = "shopcloud-${var.environment}-invoice-oldest-message-age-high"
  alarm_description   = "Oldest invoice queue message age indicates stalled processing."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.invoice_oldest_message_age_alarm_threshold_seconds
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []
  ok_actions          = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []

  dimensions = {
    QueueName = aws_sqs_queue.invoice_queue.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "orders_db_cpu_high" {
  alarm_name          = "shopcloud-${var.environment}-orders-db-cpu-high"
  alarm_description   = "Checkout RDS CPU usage is high."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = var.orders_db_cpu_alarm_threshold
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []
  ok_actions          = local.effective_alarm_topic_arn != "" ? [local.effective_alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.orders.id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_dashboard" "shopcloud_ops" {
  dashboard_name = "shopcloud-${var.environment}-ops"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Invoice Queue Depth"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.invoice_queue.name]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Invoice Oldest Message Age"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.invoice_queue.name]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Invoice DLQ Depth"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.invoice_dlq.name]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Orders DB CPU"
          region = var.aws_region
          view   = "timeSeries"
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.orders.id]
          ]
        }
      }
    ]
  })
}
