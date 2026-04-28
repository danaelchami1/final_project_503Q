# ShopCloud Phase 2

This repository contains a minimal microservices implementation of ShopCloud for phase 2:

- `catalog` (port `3001`)
- `cart` (port `3002`)
- `checkout` (port `3003`)
- `invoice-worker` (port `3004`)
- `auth` (port `3005`)
- `admin` (port `3006`)

## Run all services with Docker Compose

```bash
docker compose up --build
```

To run in detached mode:

```bash
docker compose up --build -d
```

To stop:

```bash
docker compose down
```

## Smoke test (end-to-end critical flow)

After `docker compose up` is healthy, run:

```bash
npm run smoke
```

The smoke test verifies:

1. all service `/health` endpoints
2. customer login
3. add item to cart
4. checkout
5. invoice file generation under `services/invoice-worker/invoices/`

## Quick demo API calls

Get products:

```bash
curl http://127.0.0.1:3001/products
```

Login as admin:

```bash
curl -X POST http://127.0.0.1:3005/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@example.com\",\"password\":\"admin123\"}"
```

Checkout:

```bash
curl -X POST http://127.0.0.1:3003/checkout \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"u1\",\"email\":\"customer@example.com\"}"
```

## Notes

- This is an MVP app layer. Data stores are in-memory for most services.
- `invoice-worker` simulates invoice generation by writing local text files.
