# Admin Service

Internal ShopCloud admin microservice: **inventory API** plus a small **HTML panel** at `GET /`.

## Network exposure (required for course-style “internal only”)

- The admin `Service` must stay **`ClusterIP`** (default in `k8s/admin-service.yaml`). **Do not** publish it with a `LoadBalancer` or a **public** Ingress.
- Use **`k8s/admin-private-ingress.yaml`**: AWS Load Balancer Controller with **`alb.ingress.kubernetes.io/scheme: internal`** so the ALB has **only private IPs** inside your VPC.
- Staff reach the UI over **VPN / Direct Connect / bastion / same VPC** (e.g. internal ALB DNS, or `kubectl port-forward svc/admin 3006:3006` from a trusted host).
- The **storefront nginx** must **not** proxy `/` to admin (today it does not). Do not add public routes to this service.

## Behavior

- **`GET /`**: internal inventory web UI (no secret in HTML; all writes still require an **admin** JWT on API calls).
- **`GET /admin/*`**: JSON APIs protected by validating **Bearer** tokens against **`GET /auth/admin-check`** on the auth service (Cognito **admins** pool / admin group, or local admin in dev).
- Inventory is **in-memory MVP** in this service (not wired to catalog RDS).

## Endpoints

- `GET /` — internal HTML panel
- `GET /health`
- `GET /admin/products` (admin token)
- `POST /admin/products` (admin token)
- `PATCH /admin/products/:id/stock` (admin token) — use for stock corrections and **returns** (increase/decrease stock)
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
