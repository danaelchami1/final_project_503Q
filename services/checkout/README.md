# Checkout Service

Minimal ShopCloud checkout microservice.

## Behavior

- Reads cart items from the cart service
- Reads product prices from the catalog service
- Creates an order in PostgreSQL when available (falls back to in-memory if DB is unavailable)
- Clears the user's cart
- Emits an invoice event to logs (SQS integration later)

## Endpoints

- `GET /health`
- `GET /orders`
- `POST /checkout`

## Request body example

```json
{
  "userId": "u1",
  "email": "customer@example.com"
}
```

## Environment variables

- `PORT` (default: `3003`)
- `CART_SERVICE_URL` (default: `http://127.0.0.1:3002`)
- `CATALOG_SERVICE_URL` (default: `http://127.0.0.1:3001`)
- `DATABASE_URL` (optional; otherwise built from `POSTGRES_*` env vars)
- `POSTGRES_USER` (default: `shopcloud`)
- `POSTGRES_PASSWORD` (default: `change-me-postgres`)
- `POSTGRES_HOST` (default: `127.0.0.1`)
- `POSTGRES_PORT` (default: `5432`)
- `POSTGRES_DB` (default: `shopcloud_orders`)

## Run locally

```bash
npm install
npm start
```
