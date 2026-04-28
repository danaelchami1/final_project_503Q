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

- Customer: `customer@example.com` / `customer123`
- Admin: `admin@example.com` / `admin123`

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
  "password": "customer123"
}
```

## Run locally

```bash
npm install
npm start
```

Default port: `3005`
