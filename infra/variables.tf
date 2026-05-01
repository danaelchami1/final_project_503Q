variable "aws_region" {
  description = "AWS region for ShopCloud infrastructure"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Two CIDRs for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Two CIDRs for private subnets"
  type        = list(string)
  default     = ["10.0.3.0/24", "10.0.4.0/24"]
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "shopcloud-cluster"
}

variable "node_group_name" {
  description = "EKS managed node group name"
  type        = string
  default     = "shopcloud-nodes"
}

variable "node_instance_types" {
  description = "EC2 instance types for EKS node group"
  type        = list(string)
  default     = ["t3.micro"]
}

variable "node_desired_size" {
  description = "Desired node count"
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum node count"
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum node count"
  type        = number
  default     = 3
}

variable "db_name" {
  description = "Postgres database name for checkout orders"
  type        = string
  default     = "shopcloud_orders"
}

variable "db_username" {
  description = "Postgres database username"
  type        = string
  default     = "shopcloud"
}

variable "db_password" {
  description = "Postgres database password"
  type        = string
  sensitive   = true
  default     = "shopcloud123"
}

variable "db_instance_class" {
  description = "RDS instance class for Postgres"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB for Postgres"
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "Postgres engine version"
  type        = string
  default     = "16.3"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version"
  type        = string
  default     = "7.1"
}

variable "invoice_queue_name" {
  description = "Primary SQS queue name for invoice jobs"
  type        = string
  default     = "shopcloud-dev-invoice-queue"
}

variable "invoice_bucket_name" {
  description = "S3 bucket name for generated invoice artifacts"
  type        = string
  default     = "shopcloud-dev-invoices-680666325893"
}

variable "ses_from_email" {
  description = "Verified SES sender email address for invoice notifications"
  type        = string
  default     = "noreply@shopcloud-dev.example.com"
}

variable "invoice_lambda_timeout_seconds" {
  description = "Lambda timeout in seconds for invoice SQS processing"
  type        = number
  default     = 30
}

variable "invoice_lambda_memory_mb" {
  description = "Lambda memory size in MB for invoice SQS processing"
  type        = number
  default     = 512
}

variable "invoice_lambda_batch_size" {
  description = "Number of SQS messages Lambda receives per batch"
  type        = number
  default     = 5
}

variable "enable_invoice_lambda_sqs_consumer" {
  description = "When false, the invoice Lambda SQS trigger is disabled so only EKS invoice-worker consumes the queue (avoids duplicate processing and confusing logs). Set true if you run invoices on Lambda instead of the cluster."
  type        = bool
  default     = false
}

variable "enable_rds_multi_az" {
  description = "Enable Multi-AZ deployment for primary RDS instance"
  type        = bool
  default     = false
}

variable "enable_rds_cross_region_replica" {
  description = "Enable cross-region RDS read replica for DR"
  type        = bool
  default     = false
}

variable "dr_region" {
  description = "Disaster recovery region for cross-region read replica"
  type        = string
  default     = "us-west-2"
}

variable "db_backup_retention_period" {
  description = "Number of days to retain automated RDS backups"
  type        = number
  default     = 1
}

variable "db_backup_window" {
  description = "Preferred backup window for RDS"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "Preferred maintenance window for RDS"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "enable_redis_multi_az" {
  description = "Enable Multi-AZ Redis replication group for cart"
  type        = bool
  default     = false
}

variable "enable_public_edge" {
  description = "Enable public edge chain Route53 -> CloudFront -> WAF for customer path"
  type        = bool
  default     = false
}

variable "root_domain_name" {
  description = "Route53 public hosted zone root domain (example.com)"
  type        = string
  default     = ""
}

variable "public_hostname" {
  description = "Public customer hostname (for example shop.example.com)"
  type        = string
  default     = ""
}

variable "public_alb_dns_name" {
  description = "Public ALB DNS name used as CloudFront origin"
  type        = string
  default     = ""
}

variable "public_latency_records" {
  description = "Optional latency-based Route53 aliases for the public hostname (set_identifier + region + alias target)"
  type = list(object({
    set_identifier         = string
    region                 = string
    dns_name               = string
    zone_id                = string
    evaluate_target_health = bool
  }))
  default = []
}

variable "enable_public_alb" {
  description = "Create a Terraform-managed public ALB for customer traffic"
  type        = bool
  default     = false
}

variable "enable_internal_admin_alb" {
  description = "Create a Terraform-managed internal ALB for admin traffic"
  type        = bool
  default     = false
}

variable "public_alb_certificate_arn" {
  description = "Optional ACM certificate ARN for public ALB HTTPS listener"
  type        = string
  default     = ""
}

variable "enable_shield_advanced" {
  description = "Enable AWS Shield Advanced protections for eligible edge resources"
  type        = bool
  default     = false
}

variable "public_alb_zone_id" {
  description = "Route53 zone ID of the public ALB (for alias records when needed)"
  type        = string
  default     = ""
}

variable "public_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for CloudFront"
  type        = string
  default     = ""
}

variable "enable_private_admin_path" {
  description = "Enable private admin access path resources (Client VPN scaffolding)"
  type        = bool
  default     = false
}

variable "admin_vpn_server_certificate_arn" {
  description = "ACM certificate ARN for the Client VPN *server* identity (imported server leaf + chain)"
  type        = string
  default     = ""
}

variable "admin_vpn_client_root_certificate_chain_arn" {
  description = "ACM certificate ARN for the CA that signed *client* certs (mutual authentication). Import the same CA cert used to issue client.ovpn credentials."
  type        = string
  default     = ""
}

variable "admin_vpn_client_cidr" {
  description = "CIDR block assigned to Client VPN clients"
  type        = string
  default     = "172.20.0.0/22"
}

variable "enable_secrets_architecture" {
  description = "Enable KMS + Secrets Manager + SSM + IRSA resources"
  type        = bool
  default     = false
}

variable "invoice_queue_depth_alarm_threshold" {
  description = "Queue depth threshold for invoice queue lag alarm"
  type        = number
  default     = 50
}

variable "invoice_dlq_depth_alarm_threshold" {
  description = "DLQ depth threshold for invoice processing failure alarm"
  type        = number
  default     = 1
}

variable "invoice_oldest_message_age_alarm_threshold_seconds" {
  description = "Oldest message age threshold in seconds for invoice queue staleness alarm"
  type        = number
  default     = 300
}

variable "orders_db_cpu_alarm_threshold" {
  description = "RDS CPU threshold percent for checkout database alarm"
  type        = number
  default     = 80
}

variable "alarm_notification_topic_arn" {
  description = "Optional SNS topic ARN for CloudWatch alarm notifications"
  type        = string
  default     = ""
}

variable "enable_alarm_notifications" {
  description = "Create and use an SNS topic for CloudWatch alarm notifications"
  type        = bool
  default     = false
}

variable "alarm_notification_emails" {
  description = "Email recipients subscribed to alarm notification SNS topic"
  type        = list(string)
  default     = []
}
