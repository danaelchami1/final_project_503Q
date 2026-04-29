# ShopCloud Phase 2

This repository contains a minimal microservices implementation of ShopCloud for phase 2:

- `redis` (port `6379`) for cart persistence
- `postgres` (port `5432`) for checkout order persistence
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

## Invoice trigger modes (Phase 2 continuation)

Checkout supports:
- `INVOICE_MODE=sqs` (default when `INVOICE_QUEUE_URL` is configured): publishes invoice events to Amazon SQS
- `INVOICE_MODE=http`: POSTs invoice event directly to `INVOICE_WORKER_URL/events` as fallback

Related env vars:
- `AWS_REGION`
- `INVOICE_QUEUE_URL`
- `INVOICE_DLQ_URL`
- `INVOICE_BUCKET_NAME`
- `SES_FROM_EMAIL`

## Cognito auth configuration

Auth service supports:
- single-pool mode via `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`
- dual-pool mode via:
  - `COGNITO_CUSTOMERS_USER_POOL_ID`
  - `COGNITO_CUSTOMERS_CLIENT_ID`
  - `COGNITO_ADMINS_USER_POOL_ID`
  - `COGNITO_ADMINS_CLIENT_ID`
  - `COGNITO_ADMIN_GROUP` (for admin authorization)

If both dual-pool values are present, they are preferred over single-pool values.

## Required Kubernetes secret keys

Deployments reference `shopcloud-app-secrets`. Create/update it before applying manifests:

```bash
kubectl create secret generic shopcloud-app-secrets \
  --from-literal=COGNITO_USER_POOL_ID="<optional-single-pool-id>" \
  --from-literal=COGNITO_CLIENT_ID="<optional-single-client-id>" \
  --from-literal=COGNITO_CUSTOMERS_USER_POOL_ID="<customers-pool-id>" \
  --from-literal=COGNITO_CUSTOMERS_CLIENT_ID="<customers-client-id>" \
  --from-literal=COGNITO_ADMINS_USER_POOL_ID="<admins-pool-id>" \
  --from-literal=COGNITO_ADMINS_CLIENT_ID="<admins-client-id>" \
  --from-literal=COGNITO_ADMIN_GROUP="admins" \
  --from-literal=INVOICE_QUEUE_URL="<sqs-queue-url>" \
  --from-literal=INVOICE_DLQ_URL="<sqs-dlq-url>" \
  --from-literal=INVOICE_BUCKET_NAME="<s3-bucket-name>" \
  --from-literal=SES_FROM_EMAIL="<verified-ses-email>" \
  --from-literal=DATABASE_URL="<postgres-connection-url>" \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Development deployment constraints

- In constrained dev clusters, service replicas are intentionally kept at `1` and rollouts use `maxSurge=0` to avoid deadlocks from temporary pod/IP pressure.
- Production can scale higher once node capacity and autoscaling policy are sized appropriately.

## CI/CD and Async Infra (Person B track)

- Terraform now includes async infrastructure in `infra/async.tf`:
  - `SQS` invoice queue + DLQ
  - `S3` invoice bucket
  - `SES` sender identity
  - IAM role/policy for invoice worker or Lambda execution
- GitHub Actions deploy workflows are configured to:
  - build and push all service images to ECR
  - update Kubernetes deployment images by tag
  - wait for rollout status checks

Required GitHub environment secrets (`dev` and `prod`):

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `ECR_REGISTRY`
- `EKS_CLUSTER_NAME`

## End-to-end validation evidence

Typical validation commands:

```bash
kubectl get deploy
kubectl rollout status deployment/checkout --timeout=180s
kubectl rollout status deployment/invoice-worker --timeout=180s
kubectl port-forward svc/cart 3002:3002
kubectl port-forward svc/checkout 3003:3003
curl -X POST http://127.0.0.1:3002/cart/u1/items -H "Content-Type: application/json" -d '{"productId":"p-1001","quantity":2}'
curl -X POST http://127.0.0.1:3003/checkout -H "Content-Type: application/json" -d '{"userId":"u1","email":"customer@example.com"}'
kubectl logs deployment/invoice-worker --tail=150
```
