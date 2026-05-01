# ShopCloud quick resume checklist

Use this when returning to the project after a break.

## 1) Repo and Terraform baseline

```bash
git status
terraform -chdir=infra plan -var="enable_secrets_architecture=true" -var="enable_private_admin_path=false"
```

Expected: no destructive changes unless intentionally toggling features.

## 2) Cluster health snapshot

```bash
aws eks update-kubeconfig --name shopcloud-cluster --region us-east-1
kubectl get nodes
kubectl get pods -A
```

If pods show `Too many pods`, temporarily scale down non-core deployments and/or increase nodegroup desired size.

## 3) Core service checks

```bash
kubectl get deployment catalog cart checkout invoice-worker
kubectl logs deployment/cart --tail=80
kubectl logs deployment/checkout --tail=120
kubectl logs deployment/invoice-worker --tail=120
```

## 4) Quick in-cluster E2E (cart -> checkout)

```bash
kubectl run curl-resume --rm -i --restart=Never --image=curlimages/curl --command -- sh -c "curl -sS -X DELETE http://cart:3002/cart/u1 && echo --- && curl -sS -X POST http://cart:3002/cart/u1/items -H 'Content-Type: application/json' -d '{\"productId\":\"p-1001\",\"quantity\":1}' && echo --- && curl -sS -X POST http://checkout:3003/checkout -H 'Content-Type: application/json' -d '{\"userId\":\"u1\",\"email\":\"customer@example.com\"}'"
```

Expected: checkout returns an `orderId`.

## 5) Known environment-blocked items

- Public edge path requires real hosted zone/domain/certificate + `enable_public_edge=true`.
- Private admin VPN path requires ACM certificate in `ISSUED` state.
- Full HA activation may require careful migration because of legacy VPC/state drift.

## 6) Current preferred runtime settings

- Keep `enable_secrets_architecture=true`.
- Keep `enable_private_admin_path=false` until ACM has both VPN **server** and **client CA** ARNs (`infra/scripts/generate-client-vpn-certs.sh` + imports).
- For stable local cluster capacity, keep only core deployments up when troubleshooting:
  - `catalog`, `cart`, `checkout`, `invoice-worker`.
