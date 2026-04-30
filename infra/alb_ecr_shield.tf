locals {
  ecr_repositories = [
    "shopcloud-catalog",
    "shopcloud-cart",
    "shopcloud-checkout",
    "shopcloud-auth",
    "shopcloud-admin",
    "shopcloud-invoice-worker",
    "shopcloud-frontend"
  ]
}

resource "aws_ecr_repository" "services" {
  for_each = toset(local.ecr_repositories)

  name                 = each.value
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.common_tags, {
    Name = each.value
  })
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each = aws_ecr_repository.services

  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain up to 100 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 100
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_security_group" "public_alb" {
  count = var.enable_public_alb ? 1 : 0

  name        = "shopcloud-${var.environment}-public-alb-sg"
  description = "Security group for public customer ALB"
  vpc_id      = aws_vpc.shopcloud_vpc.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_lb" "public" {
  count = var.enable_public_alb ? 1 : 0

  name               = "shopcloud-${var.environment}-public"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.public_alb[0].id]
  subnets            = [aws_subnet.public_1.id, aws_subnet.public_2.id]

  tags = local.common_tags
}

resource "aws_lb_listener" "public_http" {
  count = var.enable_public_alb ? 1 : 0

  load_balancer_arn = aws_lb.public[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"status\":\"pending\",\"message\":\"Attach EKS ingress target group\"}"
      status_code  = "503"
    }
  }
}

resource "aws_lb_listener" "public_https" {
  count = var.enable_public_alb && var.public_alb_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.public[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.public_alb_certificate_arn

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"status\":\"pending\",\"message\":\"Attach EKS ingress target group\"}"
      status_code  = "503"
    }
  }
}

resource "aws_security_group" "internal_admin_alb" {
  count = var.enable_internal_admin_alb ? 1 : 0

  name        = "shopcloud-${var.environment}-internal-admin-alb-sg"
  description = "Security group for internal admin ALB"
  vpc_id      = aws_vpc.shopcloud_vpc.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr, var.admin_vpn_client_cidr]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr, var.admin_vpn_client_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_lb" "admin_internal" {
  count = var.enable_internal_admin_alb ? 1 : 0

  name               = "shopcloud-${var.environment}-admin-int"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.internal_admin_alb[0].id]
  subnets            = [aws_subnet.private_1.id, aws_subnet.private_2.id]

  tags = local.common_tags
}

resource "aws_lb_listener" "admin_http" {
  count = var.enable_internal_admin_alb ? 1 : 0

  load_balancer_arn = aws_lb.admin_internal[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"status\":\"pending\",\"message\":\"Attach admin ingress target group\"}"
      status_code  = "503"
    }
  }
}

resource "aws_shield_protection" "cloudfront_public" {
  count = var.enable_shield_advanced && local.public_edge_enabled ? 1 : 0

  name         = "shopcloud-${var.environment}-cloudfront-shield"
  resource_arn = aws_cloudfront_distribution.public[0].arn
}

resource "aws_shield_protection" "public_alb" {
  count = var.enable_shield_advanced && var.enable_public_alb ? 1 : 0

  name         = "shopcloud-${var.environment}-public-alb-shield"
  resource_arn = aws_lb.public[0].arn
}
