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

## Redis modes

- **Local/in-cluster Redis (dev):** `REDIS_URL=redis://redis:6379`
- **Managed ElastiCache with transit encryption:** `REDIS_URL=rediss://<endpoint>:6379`

Optional:

- `REDIS_TLS_REJECT_UNAUTHORIZED` (default: `true`) for `rediss://` mode.
  - Keep `true` for normal secure operation.
  - Set to `false` only for temporary debugging with non-standard cert chains.
