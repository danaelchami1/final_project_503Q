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

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-db-subnets"
  })
}

resource "aws_db_instance" "orders" {
  identifier             = "shopcloud-${var.environment}-orders"
  engine                 = "postgres"
  engine_version         = var.db_engine_version
  instance_class         = var.db_instance_class
  allocated_storage      = var.db_allocated_storage
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  skip_final_snapshot    = true
  publicly_accessible    = false
  multi_az               = false
  db_subnet_group_name   = aws_db_subnet_group.shopcloud.name
  vpc_security_group_ids = [aws_security_group.data_plane.id]

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-orders-db"
  })
}

resource "aws_elasticache_subnet_group" "shopcloud" {
  name = "shopcloud-${var.environment}-cache-subnets"
  subnet_ids = [
    aws_subnet.private_1.id,
    aws_subnet.private_2.id
  ]
}

resource "aws_elasticache_cluster" "cart" {
  cluster_id           = "shopcloud-${var.environment}-cart"
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.shopcloud.name
  security_group_ids   = [aws_security_group.data_plane.id]
  parameter_group_name = "default.redis7"

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-cart-redis"
  })
}
