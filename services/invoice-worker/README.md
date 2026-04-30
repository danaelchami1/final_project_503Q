# Invoice Worker Service

Minimal ShopCloud invoice worker for local development.

## Behavior

- Receives invoice events over HTTP and SQS
- Generates a PDF invoice in `invoices/`
- Uploads invoice PDFs to S3 when `INVOICE_BUCKET_NAME` is configured
- Sends invoice email via SES (raw email with PDF attachment) when `SES_FROM_EMAIL` is configured
- Exposes a Lambda-compatible handler in `src/lambda.js` for SQS-triggered processing

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

## Environment variables

- `AWS_REGION` (default: `us-east-1`)
- `INVOICE_QUEUE_URL` (optional; enables poller when set)
- `INVOICE_BUCKET_NAME` (optional; enables S3 upload path)
- `SES_FROM_EMAIL` (optional; enables SES send path)
- `INVOICE_S3_UPLOAD_ENABLED` (`true` by default)
- `INVOICE_SES_SEND_ENABLED` (`true` by default)
- `INVOICE_SQS_POLL_ENABLED` (`true` by default)

Default port: `3004`
