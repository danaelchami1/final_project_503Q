# Admin Service

Minimal ShopCloud admin microservice.

## Behavior

- Protects endpoints by validating bearer tokens against auth service
- Allows admin users to manage inventory data in-memory

## Endpoints

- `GET /health`
- `GET /admin/products` (admin token)
- `POST /admin/products` (admin token)
- `PATCH /admin/products/:id/stock` (admin token)
- `DELETE /admin/products/:id` (admin token)

## Environment variables

- `PORT` (default: `3006`)
- `AUTH_SERVICE_URL` (default: `http://127.0.0.1:3005`)

## Run locally

```bash
npm install
npm start
```

Default port: `3006`
