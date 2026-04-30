output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.shopcloud_vpc.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value = [
    aws_subnet.public_1.id,
    aws_subnet.public_2.id
  ]
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value = [
    aws_subnet.private_1.id,
    aws_subnet.private_2.id
  ]
}

output "internet_gateway_id" {
  description = "Internet Gateway ID"
  value       = aws_internet_gateway.igw.id
}

output "nat_gateway_id" {
  description = "NAT Gateway ID"
  value       = aws_nat_gateway.nat.id
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.shopcloud.name
}

output "cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = aws_eks_cluster.shopcloud.endpoint
}

output "orders_db_endpoint" {
  description = "RDS Postgres endpoint for checkout"
  value       = aws_db_instance.orders.address
}

output "orders_db_port" {
  description = "RDS Postgres port"
  value       = aws_db_instance.orders.port
}

output "orders_database_url" {
  description = "Connection URL for checkout service"
  value       = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.orders.address}:${aws_db_instance.orders.port}/${var.db_name}"
  sensitive   = true
}

output "cart_redis_endpoint" {
  description = "ElastiCache Redis endpoint for cart"
  value       = var.enable_redis_multi_az ? aws_elasticache_replication_group.cart_ha[0].primary_endpoint_address : aws_elasticache_cluster.cart[0].cache_nodes[0].address
}

output "cart_redis_url" {
  description = "Redis URL for cart service"
  value       = var.enable_redis_multi_az ? "redis://${aws_elasticache_replication_group.cart_ha[0].primary_endpoint_address}:${aws_elasticache_replication_group.cart_ha[0].port}" : "redis://${aws_elasticache_cluster.cart[0].cache_nodes[0].address}:${aws_elasticache_cluster.cart[0].port}"
}

output "invoice_queue_url" {
  description = "SQS queue URL for invoice jobs"
  value       = aws_sqs_queue.invoice_queue.id
}

output "invoice_queue_arn" {
  description = "SQS queue ARN for invoice jobs"
  value       = aws_sqs_queue.invoice_queue.arn
}

output "invoice_dlq_url" {
  description = "SQS dead-letter queue URL for invoice jobs"
  value       = aws_sqs_queue.invoice_dlq.id
}

output "invoice_bucket_name" {
  description = "S3 bucket for generated invoices"
  value       = aws_s3_bucket.invoices.bucket
}

output "ses_sender_email" {
  description = "SES sender identity email"
  value       = aws_ses_email_identity.invoice_sender.email
}

output "invoice_worker_role_arn" {
  description = "IAM role ARN for invoice worker/lambda execution"
  value       = aws_iam_role.invoice_worker_role.arn
}

output "invoice_lambda_function_name" {
  description = "Lambda function name for invoice processing"
  value       = aws_lambda_function.invoice_processor.function_name
}

output "invoice_lambda_function_arn" {
  description = "Lambda function ARN for invoice processing"
  value       = aws_lambda_function.invoice_processor.arn
}

output "invoice_lambda_event_source_mapping_uuid" {
  description = "Event source mapping UUID for SQS to invoice Lambda"
  value       = aws_lambda_event_source_mapping.invoice_queue_to_lambda.uuid
}

output "public_edge_enabled" {
  description = "Whether public edge resources are enabled"
  value       = local.public_edge_enabled
}

output "public_cloudfront_domain_name" {
  description = "CloudFront domain name for customer path"
  value       = local.public_edge_enabled ? aws_cloudfront_distribution.public[0].domain_name : null
}

output "public_waf_arn" {
  description = "WAF ARN attached to CloudFront distribution"
  value       = local.public_edge_enabled ? aws_wafv2_web_acl.public_cf[0].arn : null
}

output "orders_db_dr_replica_endpoint" {
  description = "Cross-region RDS read replica endpoint for DR"
  value       = var.enable_rds_cross_region_replica ? aws_db_instance.orders_replica_dr[0].address : null
}

output "cognito_customers_user_pool_id" {
  description = "Cognito user pool ID for customer users"
  value       = aws_cognito_user_pool.customers.id
}

output "cognito_customers_user_pool_arn" {
  description = "Cognito user pool ARN for customer users"
  value       = aws_cognito_user_pool.customers.arn
}

output "cognito_customers_client_id" {
  description = "Cognito app client ID for customer auth"
  value       = aws_cognito_user_pool_client.customers_app.id
}

output "cognito_admins_user_pool_id" {
  description = "Cognito user pool ID for admin users"
  value       = aws_cognito_user_pool.admins.id
}

output "cognito_admins_user_pool_arn" {
  description = "Cognito user pool ARN for admin users"
  value       = aws_cognito_user_pool.admins.arn
}

output "cognito_admins_client_id" {
  description = "Cognito app client ID for admin auth"
  value       = aws_cognito_user_pool_client.admins_app.id
}

output "cognito_admins_group_name" {
  description = "Cognito admin group name"
  value       = aws_cognito_user_group.admins.name
}

output "admin_vpn_endpoint_id" {
  description = "Client VPN endpoint ID for private admin path"
  value       = local.private_admin_enabled ? aws_ec2_client_vpn_endpoint.admin[0].id : null
}

output "checkout_irsa_role_arn" {
  description = "IRSA role ARN assigned to checkout service account"
  value       = var.enable_secrets_architecture ? aws_iam_role.checkout_irsa[0].arn : null
}

output "checkout_secret_arn" {
  description = "Secrets Manager ARN for checkout configuration secret"
  value       = var.enable_secrets_architecture ? aws_secretsmanager_secret.checkout[0].arn : null
}

output "invoice_queue_depth_alarm_name" {
  description = "CloudWatch alarm for high invoice queue depth"
  value       = aws_cloudwatch_metric_alarm.invoice_queue_depth_high.alarm_name
}

output "invoice_dlq_depth_alarm_name" {
  description = "CloudWatch alarm for invoice dead-letter queue depth"
  value       = aws_cloudwatch_metric_alarm.invoice_dlq_depth_high.alarm_name
}

output "invoice_queue_oldest_message_age_alarm_name" {
  description = "CloudWatch alarm for invoice queue oldest message age"
  value       = aws_cloudwatch_metric_alarm.invoice_queue_oldest_message_age_high.alarm_name
}

output "orders_db_cpu_alarm_name" {
  description = "CloudWatch alarm for checkout RDS CPU utilization"
  value       = aws_cloudwatch_metric_alarm.orders_db_cpu_high.alarm_name
}

output "ops_dashboard_name" {
  description = "CloudWatch operations dashboard name"
  value       = aws_cloudwatch_dashboard.shopcloud_ops.dashboard_name
}

output "alarm_notification_topic_arn_effective" {
  description = "Effective SNS topic ARN used by CloudWatch alarms"
  value       = local.effective_alarm_topic_arn != "" ? local.effective_alarm_topic_arn : null
}
