# Auth Service

Minimal ShopCloud auth microservice.

## Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (requires bearer token)
- `POST /auth/logout` (requires bearer token)
- `GET /auth/admin-check` (requires admin token)
- `POST /auth/cognito-admin/login` — body `{ "email", "password" }` against the **admins** Cognito app client (`USER_PASSWORD_AUTH`). Returns tokens or an MFA challenge (`SOFTWARE_TOKEN_MFA` / `MFA_SETUP`). Requires IAM `cognito-idp:InitiateAuth` on the admins user pool (see `infra/security.tf` when `enable_secrets_architecture` is true, or attach `infra/examples/iam-cognito-admin-login-policy.json` to the auth pod IRSA role).
- `POST /auth/cognito-admin/respond-mfa` — body `{ "email", "session", "mfaCode" }` for `SOFTWARE_TOKEN_MFA`.

## Seed users

- Customer: `customer@example.com` / value of `LOCAL_AUTH_CUSTOMER_PASSWORD` (default `change-me-customer`)
- Admin: `admin@example.com` / value of `LOCAL_AUTH_ADMIN_PASSWORD` (default `change-me-admin`)

## Request examples

`POST /auth/register`

```json
{
  "email": "new-user@example.com",
  "password": "secret123",
  "role": "customer"
}
```

`POST /auth/login`

```json
{
  "email": "customer@example.com",
  "password": "change-me-customer"
}
```

## Run locally

```bash
npm install
npm start
```

Default port: `3005`
