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
- `frontend` (port `3000`) test UI for app flows

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

Open frontend test UI:

```bash
http://127.0.0.1:3000
```

Get products:

```bash
curl http://127.0.0.1:3001/products
```

Login as admin:

```bash
curl -X POST http://127.0.0.1:3005/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@example.com\",\"password\":\"change-me-admin\"}"
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
- `INVOICE_SQS_POLL_ENABLED` (invoice-worker; default `true`)

## Cognito auth configuration

`auth` supports either:
- single-pool mode via `COGNITO_USER_POOL_ID` + `COGNITO_CLIENT_ID`
- dual-pool mode via `COGNITO_CUSTOMERS_*` and `COGNITO_ADMINS_*`

When both are set, any valid token from either configured pool/client pair is accepted and
admin role is derived from `cognito:groups` with `COGNITO_ADMIN_GROUP`.
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
- `EXPECTED_AWS_ACCOUNT_ID` (recommended for environment boundary enforcement in deploy workflows)

## Monitoring and observability baseline

Terraform provisions CloudWatch alarms for:
- invoice queue depth (`ApproximateNumberOfMessagesVisible`)
- invoice DLQ depth (`ApproximateNumberOfMessagesVisible`)
- invoice queue oldest message age (`ApproximateAgeOfOldestMessage`)
- checkout RDS CPU utilization (`CPUUtilization`)

Alarm thresholds are configurable in `infra/variables.tf`:
- `invoice_queue_depth_alarm_threshold`
- `invoice_dlq_depth_alarm_threshold`
- `invoice_oldest_message_age_alarm_threshold_seconds`
- `orders_db_cpu_alarm_threshold`
- `alarm_notification_topic_arn` (optional SNS topic ARN for alarm and recovery notifications)
- `enable_alarm_notifications` (create project SNS topic for alarms)
- `alarm_notification_emails` (email subscriptions for project alarm topic)

On-call response playbook:
- `docs/oncall-runbook.md`
- ALB controller installation runbook:
  - `docs/alb-controller-runbook.md`

## Secrets architecture runtime cutover (checkout)

When Terraform `enable_secrets_architecture=true` is enabled, checkout can read runtime config
from AWS Secrets Manager instead of only Kubernetes literals.

Checkout runtime envs:
- `USE_AWS_SECRETS=true`
- `CHECKOUT_CONFIG_SECRET_ID=shopcloud/<env>/checkout`
- `AWS_REGION=<region>`

Kubernetes default:
- `k8s/checkout-deployment.yaml` sets `USE_AWS_SECRETS=true` and reads `CHECKOUT_CONFIG_SECRET_ID` from `shopcloud-app-secrets`.

Expected secret JSON fields:
- `DATABASE_URL`
- `INVOICE_QUEUE_URL`

Fallback behavior:
- if AWS secret load fails, checkout logs the error and falls back to existing env values.

## Dev/Prod isolation conventions

Use separate tfvars files and GitHub environments:
- `infra/envs/dev.tfvars.example`
- `infra/envs/prod.tfvars.example`
- GitHub Actions `environment: dev` and `environment: prod` already split deploy credentials.
- Formal evidence checklist: `docs/dev-prod-isolation-evidence.md`

Example Terraform usage:
```bash
terraform -chdir=infra plan -var-file=envs/dev.tfvars
terraform -chdir=infra plan -var-file=envs/prod.tfvars
```

## Remaining feature activations (runtime)

The following are implemented in code but require explicit activation:
- Public edge path:
  - apply `k8s/public-customer-ingress.yaml` (internet-facing ALB via AWS Load Balancer Controller)
  - set `enable_public_edge=true` with valid Route53 zone + hostname
  - set `public_alb_dns_name` to the public ingress ALB DNS
  - optional: configure `public_latency_records` for Route53 latency-based alias routing
- Private admin path: set `enable_private_admin_path=true` plus ACM ARNs for **server** and **client CA** (`admin_vpn_server_certificate_arn`, `admin_vpn_client_root_certificate_chain_arn`). Use `infra/scripts/generate-client-vpn-certs.sh` and `terraform output admin_client_vpn_endpoint_dns_name`; details in `services/admin/README.md`.
- RDS/Redis HA modes: set `enable_rds_multi_az=true`, `enable_rds_cross_region_replica=true`, `enable_redis_multi_az=true` in target environment.

## CI depth additions

CI now includes:
- Terraform init/fmt/validate checks
- Kubernetes manifest validation (`kubectl apply --dry-run=client`)
- service syntax and docker build checks
- runtime dependency audit (`npm audit --omit=dev --audit-level=critical`)
- Docker Compose integration smoke test (`npm run smoke`)

## Current implementation status (personal tracker)

Completed and stable:
- Async backbone in place (`checkout` SQS publish + `invoice-worker` SQS polling path in code).
- Cognito dual-pool auth support implemented.
- Secrets architecture resources provisioned (KMS/Secrets Manager/IRSA scaffolding).
- Observability baseline implemented (CloudWatch alarms + ops dashboard).
- CI depth improved (Terraform validate/fmt + service build/syntax + dependency audit).

Partially complete / environment-blocked:
- Public edge path requires real Route53 hosted zone/domain + active public ingress ALB DNS + `enable_public_edge=true`.
- Private admin VPN path requires two ACM imports (server + client-signing CA), Client VPN SG ingress fix in `infra/private_admin.tf`, and AWS VPN Client profile with mutual TLS.
- Full HA activation (RDS DR + Redis Multi-AZ) is coded but may be blocked by existing env drift/state constraints.

Runtime caveat to resolve when resuming:
- `checkout` secrets mode can still fall back to in-memory orders if the AWS secret value and live RDS credentials are not aligned.
