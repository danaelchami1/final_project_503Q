resource "aws_cognito_user_pool" "customers" {
  name = "shopcloud-${var.environment}-customers"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = local.common_tags
}

resource "aws_cognito_user_pool_client" "customers_app" {
  name         = "shopcloud-${var.environment}-customers-client"
  user_pool_id = aws_cognito_user_pool.customers.id

  generate_secret     = false
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH"]
}

resource "aws_cognito_user_pool" "admins" {
  name = "shopcloud-${var.environment}-admins"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 10
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # TOTP MFA for staff (architecture PDF: certificate at VPN + MFA at identity).
  # Enroll each admin user once: Cognito console → Users → user → MFA → Associate authenticator app.
  mfa_configuration = "ON"

  software_token_mfa_configuration {
    enabled = true
  }

  tags = local.common_tags
}

resource "aws_cognito_user_pool_client" "admins_app" {
  name         = "shopcloud-${var.environment}-admins-client"
  user_pool_id = aws_cognito_user_pool.admins.id

  generate_secret     = false
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_SRP_AUTH"]
}

resource "aws_cognito_user_group" "admins" {
  name         = "admins"
  user_pool_id = aws_cognito_user_pool.admins.id
  description  = "Administrative users with access to internal admin panel"
}
