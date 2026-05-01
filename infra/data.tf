resource "aws_security_group" "data_plane" {
  name        = "shopcloud-${var.environment}-data-sg"
  description = "Allow EKS nodes to access Redis and Postgres"
  vpc_id      = aws_vpc.shopcloud_vpc.id

  ingress {
    description = "Postgres from VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  ingress {
    description = "Redis from VPC"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-data-sg"
  })
}

resource "aws_db_subnet_group" "shopcloud" {
  name = "shopcloud-${var.environment}-db-subnets"
  subnet_ids = [
    aws_subnet.private_1.id,
    aws_subnet.private_2.id
  ]

  lifecycle {
    # Existing subnet groups are often attached to live DBs and cannot be changed safely in-place.
    ignore_changes = [subnet_ids]
  }

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-db-subnets"
  })
}

data "aws_kms_key" "dr_rds" {
  provider = aws.dr
  key_id   = "alias/aws/rds"
}

resource "aws_db_instance" "orders" {
  identifier              = "shopcloud-${var.environment}-orders"
  engine                  = "postgres"
  engine_version          = var.db_engine_version
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  db_name                 = var.db_name
  username                = var.db_username
  password                = var.db_password
  skip_final_snapshot     = true
  publicly_accessible     = false
  multi_az                = var.enable_rds_multi_az
  backup_retention_period = var.db_backup_retention_period
  backup_window           = var.db_backup_window
  maintenance_window      = var.db_maintenance_window
  storage_encrypted       = true
  deletion_protection     = var.environment == "prod"
  db_subnet_group_name    = aws_db_subnet_group.shopcloud.name
  vpc_security_group_ids  = [aws_security_group.data_plane.id]

  lifecycle {
    # Imported/live DB may already be pinned to a different VPC/subnet group.
    # Avoid disruptive cross-VPC modify attempts during drift reconciliation.
    ignore_changes = [
      db_subnet_group_name,
      vpc_security_group_ids
    ]
  }

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-orders-db"
  })
}

resource "aws_db_instance" "orders_replica_dr" {
  count    = var.enable_rds_cross_region_replica ? 1 : 0
  provider = aws.dr

  identifier                 = "shopcloud-${var.environment}-orders-dr-replica"
  replicate_source_db        = aws_db_instance.orders.arn
  instance_class             = var.db_instance_class
  publicly_accessible        = false
  auto_minor_version_upgrade = true
  storage_encrypted          = true
  # Cross-region replicas of encrypted sources must specify a destination-region KMS key ARN.
  kms_key_id          = data.aws_kms_key.dr_rds.arn
  skip_final_snapshot = true
}

resource "aws_elasticache_subnet_group" "shopcloud" {
  # Use a versioned name to avoid collisions with legacy subnet groups tied to old VPCs.
  name = "shopcloud-${var.environment}-cache-subnets-v2"
  subnet_ids = [
    aws_subnet.private_1.id,
    aws_subnet.private_2.id
  ]

  lifecycle {
    # Existing subnet groups can be locked while cache clusters are attached.
    ignore_changes = [subnet_ids]
  }
}

resource "aws_elasticache_cluster" "cart" {
  count                = var.enable_redis_multi_az ? 0 : 1
  cluster_id           = "shopcloud-${var.environment}-cart"
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.shopcloud.name
  security_group_ids   = [aws_security_group.data_plane.id]
  parameter_group_name = "default.redis7"

  lifecycle {
    # Imported/live cache clusters may be pinned to existing VPC SG/subnet groups.
    # Avoid cross-VPC modify attempts during drift reconciliation.
    ignore_changes = [
      subnet_group_name,
      security_group_ids
    ]
  }

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-cart-redis"
  })
}

resource "aws_elasticache_replication_group" "cart_ha" {
  count = var.enable_redis_multi_az ? 1 : 0

  replication_group_id       = "shopcloud-${var.environment}-cart-rg"
  description                = "ShopCloud cart Redis Multi-AZ replication group"
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = var.redis_node_type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.shopcloud.name
  security_group_ids         = [aws_security_group.data_plane.id]
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-cart-redis-ha"
  })
}
