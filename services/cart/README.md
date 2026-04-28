# Cart Service

Minimal ShopCloud cart microservice.

Uses Redis when available (`REDIS_URL`), with in-memory fallback for local resilience.

## Endpoints

- `GET /health`
- `GET /cart/:userId`
- `POST /cart/:userId/items`
- `DELETE /cart/:userId/items/:productId`
- `DELETE /cart/:userId`

## Request body example

`POST /cart/:userId/items`

```json
{
  "productId": "p-1001",
  "quantity": 2
}
```

## Run locally

```bash
npm install
npm start
```

Default port: `3002`
Default Redis URL: `redis://127.0.0.1:6379`
