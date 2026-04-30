# Frontend Service

Minimal web UI for testing ShopCloud flows.

## Endpoints

- `GET /health`
- `GET /` (test UI)
- `GET /api/products`
- `POST /api/login`
- `GET /api/cart/:userId`
- `POST /api/cart/:userId/items`
- `DELETE /api/cart/:userId`
- `POST /api/checkout`
- `GET /api/orders`

## Run locally

```bash
npm install
npm start
```

Default port: `3000`
