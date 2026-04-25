# Invoice Worker Service

Minimal ShopCloud invoice worker for local development.

## Behavior

- Receives invoice events
- Generates local invoice text file in `invoices/`
- Simulates sending email (logs target email)

## Endpoints

- `GET /health`
- `POST /events`

## Event body example

```json
{
  "eventType": "order.confirmed",
  "orderId": "ord-123",
  "userId": "u1",
  "email": "customer@example.com",
  "total": 119.98,
  "currency": "USD",
  "items": [
    {
      "productId": "p-1001",
      "quantity": 2,
      "unitPrice": 59.99
    }
  ],
  "timestamp": "2026-04-25T17:25:54.455Z"
}
```

## Run locally

```bash
npm install
npm start
```

Default port: `3004`
