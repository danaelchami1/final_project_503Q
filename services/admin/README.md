# Admin Service

Internal ShopCloud admin microservice: **inventory API** plus a small **HTML panel** at `GET /`.

## Network exposure (required for course-style “internal only”)

- The admin `Service` must stay **`ClusterIP`** (default in `k8s/admin-service.yaml`). **Do not** publish it with a `LoadBalancer` or a **public** Ingress.
- Use **`k8s/admin-private-ingress.yaml`**: AWS Load Balancer Controller with **`alb.ingress.kubernetes.io/scheme: internal`** so the ALB has **only private IPs** inside your VPC.
- Staff reach the UI over **VPN / Direct Connect / bastion / same VPC** (e.g. internal ALB DNS, or `kubectl port-forward svc/admin 3006:3006` from a trusted host).
- The **storefront nginx** must **not** proxy `/` to admin (today it does not). Do not add public routes to this service.

### AWS Client VPN (browser on your PC, no `kubectl port-forward`)

Terraform in `infra/private_admin.tf` can create an **AWS Client VPN** endpoint in your VPC. After you connect with **AWS VPN Client** (or OpenVPN), your laptop has a route into the VPC so the **internal admin ALB** URL loads in a normal browser.

1. Generate CA + server + client material (Git Bash / WSL; output is gitignored):

   `bash infra/scripts/generate-client-vpn-certs.sh`

2. Import the generated certs into **ACM** in the same region as the VPN (see the script’s printed `aws acm import-certificate` commands). You need **two** ARNs: server leaf (with chain) and CA (for mutual auth).

3. In Terraform (`terraform.tfvars` or `infra/envs/*.tfvars`), set:

   - `enable_private_admin_path = true`
   - `admin_vpn_server_certificate_arn` — ACM ARN for the **server** certificate import
   - `admin_vpn_client_root_certificate_chain_arn` — ACM ARN for the **CA** that signed **client** certs

   Apply: `terraform -chdir=infra apply` (or your usual `-var-file`).

4. Read **`terraform output admin_client_vpn_endpoint_dns_name`**. In the AWS console, download the Client VPN configuration for that endpoint, then add the **client** cert and key per [AWS mutual authentication docs](https://docs.aws.amazon.com/vpn/latest/clientvpn-user/mutual.html).

5. Connect the VPN profile, then open the internal admin ALB (HTTP), for example:

   `kubectl get ingress admin-private -o jsonpath='{.status.loadBalancer.ingress[0].hostname}{"\n"}'`

The VPN endpoint security group allows **UDP/TCP 443** from the internet to the endpoint only; the admin app itself stays on the **internal** ALB, not on CloudFront.

### MFA (matches architecture: certificate + MFA)

- **VPN:** mutual TLS **device certificate** (see above).
- **Identity:** the **admins** Cognito user pool has **MFA `ON`** with **TOTP** (Terraform `infra/cognito.tf`). The internal admin HTML includes **Sign in (Cognito admins + MFA)** which calls the auth service (proxied as `/cognito-admin/*` on this service).

**IAM for EKS:** if `enable_secrets_architecture` is `true` in Terraform, the `shopcloud-*-auth-irsa` managed policy already includes `InitiateAuth` / `RespondToAuthChallenge` on the admins pool. If that flag is `false`, attach an inline policy to the **same IAM role** referenced by `k8s/auth-serviceaccount.yaml` (see `infra/examples/iam-cognito-admin-login-policy.json` — replace `REGION`, `ACCOUNT_ID`, `ADMINS_USER_POOL_ID`).

## How to test (end-to-end)

1. **Apply Terraform** (at least Cognito): admins pool must show MFA **ON** (already in `infra/cognito.tf`).
2. **Enroll TOTP for one admin user:** AWS Console → Cognito → user pool **shopcloud-*-admins** → Users → pick the staff user → **MFA** tab → **Associate an MFA device** → scan QR in Google Authenticator / Authy.
3. **Confirm the user is in the `admins` group** (same pool → Groups → `admins`).
4. **IAM:** ensure the auth pod role can call Cognito (previous section). Redeploy auth if you changed IAM.
5. **Build and push** images that include this code, then update EKS, for example:
   - `services/auth` and `services/admin` → ECR tags you use in `k8s/auth-deployment.yaml` and `k8s/admin-deployment.yaml`, then `kubectl rollout restart deployment/auth deployment/admin`.
6. **VPN:** connect **AWS VPN Client** with your merged `.ovpn` profile (`infra/.vpn-certs-generated/shopcloud-admin.ovpn`).
7. **Browser:** open the **internal** admin ALB (HTTP), e.g. `kubectl get ingress admin-private -o jsonpath='{.status.loadBalancer.ingress[0].hostname}{"\n"}'`.
8. On the admin page: enter **email + password** → **Sign in**. If prompted, enter the **6-digit TOTP** → **Submit MFA**. The **Admin access token** field should fill; click **Refresh inventory** / **Refresh orders**.

**Port-forward shortcut (no VPN):** `kubectl port-forward svc/admin 3006:3006` → `http://localhost:3006` (Cognito MFA login still needs the auth pod to reach AWS Cognito with valid IAM).

## Behavior

- **`GET /`**: internal inventory web UI (no secret in HTML; all writes still require an **admin** JWT on API calls).
- **`GET /admin/*`**: JSON APIs protected by validating **Bearer** tokens against **`GET /auth/admin-check`** on the auth service (Cognito **admins** pool / admin group, or local admin in dev).
- Inventory is **in-memory MVP** in this service (not wired to catalog RDS).

## Endpoints

- `GET /` — internal HTML panel
- `GET /health`
- `GET /admin/orders` (admin token) — proxies to checkout `GET /orders` for read-only order list
- `GET /admin/products` (admin token)
- `POST /admin/products` (admin token)
- `PATCH /admin/products/:id/stock` (admin token) — use for stock corrections and **returns** (increase/decrease stock)
- `DELETE /admin/products/:id` (admin token)

## Environment variables

- `PORT` (default: `3006`)
- `AUTH_SERVICE_URL` (default: `http://127.0.0.1:3005`)
- `CHECKOUT_SERVICE_URL` (default: `http://127.0.0.1:3003`) — used by `GET /admin/orders`

## Run locally

```bash
npm install
npm start
```

Default port: `3006`
