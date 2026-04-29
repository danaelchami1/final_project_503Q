locals {
  private_admin_enabled = var.enable_private_admin_path && var.admin_vpn_server_certificate_arn != ""
}

resource "aws_security_group" "admin_vpn" {
  count = local.private_admin_enabled ? 1 : 0

  name        = "shopcloud-${var.environment}-admin-vpn-sg"
  description = "Security group for private admin VPN path"
  vpc_id      = aws_vpc.shopcloud_vpc.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-admin-vpn-sg"
  })
}

resource "aws_ec2_client_vpn_endpoint" "admin" {
  count = local.private_admin_enabled ? 1 : 0

  description            = "ShopCloud admin private access endpoint"
  server_certificate_arn = var.admin_vpn_server_certificate_arn
  client_cidr_block      = var.admin_vpn_client_cidr
  split_tunnel           = true
  vpc_id                 = aws_vpc.shopcloud_vpc.id
  security_group_ids     = [aws_security_group.admin_vpn[0].id]

  authentication_options {
    type = "certificate-authentication"

    root_certificate_chain_arn = var.admin_vpn_server_certificate_arn
  }

  connection_log_options {
    enabled = false
  }

  tags = merge(local.common_tags, {
    Name = "shopcloud-${var.environment}-admin-vpn-endpoint"
  })
}

resource "aws_ec2_client_vpn_network_association" "admin_private_1" {
  count = local.private_admin_enabled ? 1 : 0

  client_vpn_endpoint_id = aws_ec2_client_vpn_endpoint.admin[0].id
  subnet_id              = aws_subnet.private_1.id
}

resource "aws_ec2_client_vpn_network_association" "admin_private_2" {
  count = local.private_admin_enabled ? 1 : 0

  client_vpn_endpoint_id = aws_ec2_client_vpn_endpoint.admin[0].id
  subnet_id              = aws_subnet.private_2.id
}

resource "aws_ec2_client_vpn_authorization_rule" "admin_vpc" {
  count = local.private_admin_enabled ? 1 : 0

  client_vpn_endpoint_id = aws_ec2_client_vpn_endpoint.admin[0].id
  target_network_cidr    = var.vpc_cidr
  authorize_all_groups   = true
}
