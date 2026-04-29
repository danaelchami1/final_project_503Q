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
