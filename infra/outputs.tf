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
  value       = aws_elasticache_cluster.cart.cache_nodes[0].address
}

output "cart_redis_url" {
  description = "Redis URL for cart service"
  value       = "redis://${aws_elasticache_cluster.cart.cache_nodes[0].address}:${aws_elasticache_cluster.cart.port}"
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
