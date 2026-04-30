data "aws_eks_cluster" "current" {
  count = var.enable_secrets_architecture ? 1 : 0
  name  = aws_eks_cluster.shopcloud.name
}

data "aws_iam_openid_connect_provider" "eks" {
  count = var.enable_secrets_architecture ? 1 : 0
  url   = data.aws_eks_cluster.current[0].identity[0].oidc[0].issuer
}

resource "aws_kms_key" "app_secrets" {
  count = var.enable_secrets_architecture ? 1 : 0

  description             = "KMS key for ShopCloud application secrets"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_alias" "app_secrets" {
  count = var.enable_secrets_architecture ? 1 : 0

  name          = "alias/shopcloud-${var.environment}-app-secrets"
  target_key_id = aws_kms_key.app_secrets[0].key_id
}

resource "aws_secretsmanager_secret" "checkout" {
  count = var.enable_secrets_architecture ? 1 : 0

  name       = "shopcloud/${var.environment}/checkout"
  kms_key_id = aws_kms_key.app_secrets[0].arn
}

resource "aws_secretsmanager_secret_version" "checkout" {
  count = var.enable_secrets_architecture ? 1 : 0

  secret_id = aws_secretsmanager_secret.checkout[0].id
  secret_string = jsonencode({
    DATABASE_URL      = "postgres://replace-user:replace-password@replace-host:5432/shopcloud_orders"
    INVOICE_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/replace-account/shopcloud-dev-invoice-queue"
  })
}

resource "aws_ssm_parameter" "auth_customer_pool_id" {
  count = var.enable_secrets_architecture ? 1 : 0

  name  = "/shopcloud/${var.environment}/auth/cognito/customers_pool_id"
  type  = "String"
  value = aws_cognito_user_pool.customers.id
}

resource "aws_ssm_parameter" "auth_customer_client_id" {
  count = var.enable_secrets_architecture ? 1 : 0

  name  = "/shopcloud/${var.environment}/auth/cognito/customers_client_id"
  type  = "String"
  value = aws_cognito_user_pool_client.customers_app.id
}

resource "aws_iam_role" "checkout_irsa" {
  count = var.enable_secrets_architecture ? 1 : 0
  name  = "shopcloud-${var.environment}-checkout-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.eks[0].arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(data.aws_iam_openid_connect_provider.eks[0].url, "https://", "")}:sub" = "system:serviceaccount:default:checkout-sa"
            "${replace(data.aws_iam_openid_connect_provider.eks[0].url, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "checkout_irsa" {
  count = var.enable_secrets_architecture ? 1 : 0
  name  = "shopcloud-${var.environment}-checkout-irsa-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "ssm:GetParameter",
          "kms:Decrypt",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_secretsmanager_secret.checkout[0].arn,
          aws_ssm_parameter.auth_customer_pool_id[0].arn,
          aws_ssm_parameter.auth_customer_client_id[0].arn,
          aws_kms_key.app_secrets[0].arn,
          aws_sqs_queue.invoice_queue.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "checkout_irsa" {
  count      = var.enable_secrets_architecture ? 1 : 0
  role       = aws_iam_role.checkout_irsa[0].name
  policy_arn = aws_iam_policy.checkout_irsa[0].arn
}

resource "aws_iam_role" "invoice_worker_irsa" {
  count = var.enable_secrets_architecture ? 1 : 0
  name  = "shopcloud-${var.environment}-invoice-worker-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.eks[0].arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(data.aws_iam_openid_connect_provider.eks[0].url, "https://", "")}:sub" = [
              "system:serviceaccount:default:invoice-worker-sa",
              "system:serviceaccount:keda:keda-operator"
            ]
            "${replace(data.aws_iam_openid_connect_provider.eks[0].url, "https://", "")}:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "invoice_worker_irsa" {
  count      = var.enable_secrets_architecture ? 1 : 0
  role       = aws_iam_role.invoice_worker_irsa[0].name
  policy_arn = aws_iam_policy.invoice_worker_policy.arn
}
