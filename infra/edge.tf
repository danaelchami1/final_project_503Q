locals {
  public_edge_enabled = (
    var.enable_public_edge &&
    var.root_domain_name != "" &&
    var.public_hostname != "" &&
    var.public_alb_dns_name != "" &&
    var.public_acm_certificate_arn != ""
  )
}

data "aws_route53_zone" "public" {
  count        = local.public_edge_enabled ? 1 : 0
  name         = var.root_domain_name
  private_zone = false
}

resource "aws_wafv2_web_acl" "public_cf" {
  count    = local.public_edge_enabled ? 1 : 0
  provider = aws.us_east_1

  name  = "shopcloud-${var.environment}-public-cf-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Minimal managed protections; can be expanded as needed.
  rule {
    name     = "AWSManagedCommon"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "shopcloudCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "shopcloudPublicCfWaf"
    sampled_requests_enabled   = true
  }

  tags = local.common_tags
}

resource "aws_cloudfront_distribution" "public" {
  count = local.public_edge_enabled ? 1 : 0

  enabled         = true
  is_ipv6_enabled = true
  comment         = "ShopCloud public customer edge"
  aliases         = [var.public_hostname]
  web_acl_id      = aws_wafv2_web_acl.public_cf[0].arn

  origin {
    domain_name = var.public_alb_dns_name
    origin_id   = "shopcloud-public-alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "shopcloud-public-alb"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = true
      headers      = ["Authorization", "Host", "Origin"]

      cookies {
        forward = "all"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.public_acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.common_tags
}

resource "aws_route53_record" "public_customer" {
  count = local.public_edge_enabled ? 1 : 0

  zone_id = data.aws_route53_zone.public[0].zone_id
  name    = var.public_hostname
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.public[0].domain_name
    zone_id                = aws_cloudfront_distribution.public[0].hosted_zone_id
    evaluate_target_health = false
  }
}
