# Auth Service

Minimal ShopCloud auth microservice.

## Endpoints

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me` (requires bearer token)
- `POST /auth/logout` (requires bearer token)
- `GET /auth/admin-check` (requires admin token)

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
