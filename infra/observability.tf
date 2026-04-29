resource "aws_cloudwatch_metric_alarm" "invoice_queue_depth_high" {
  alarm_name          = "shopcloud-${var.environment}-invoice-queue-depth-high"
  alarm_description   = "Invoice queue depth is too high, indicating processing lag."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 50
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.invoice_queue.name
  }

  tags = local.common_tags
}
