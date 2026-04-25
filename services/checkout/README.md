# Checkout Service

Minimal ShopCloud checkout microservice.

## Behavior

- Reads cart items from the cart service
- Reads product prices from the catalog service
- Creates an in-memory order
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

## Run locally

```bash
npm install
npm start
```
