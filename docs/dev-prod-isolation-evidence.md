# Dev/Prod Isolation Evidence

Use this document to capture formal evidence that development and production are isolated.

## 1) Environment boundary controls in CI/CD

Implemented controls:
- `deploy-dev.yml` uses GitHub environment `dev`
- `deploy-prod.yml` uses GitHub environment `prod`
- Both workflows enforce AWS account + ECR registry boundary checks before deploy.

Evidence to record:
- Screenshot/log of successful `deploy-dev` run with `environment: dev`
- Screenshot/log of successful `deploy-prod` run with `environment: prod`
- Screenshot/log showing boundary check step output (`Caller account` and pass status)

## 2) Terraform environment configuration separation

Implemented controls:
- `infra/envs/dev.tfvars.example` and `infra/envs/prod.tfvars.example` exist with different defaults.

Evidence commands:

```bash
terraform -chdir=infra plan -var-file=envs/dev.tfvars
terraform -chdir=infra plan -var-file=envs/prod.tfvars
```

Capture:
- summary lines for both plans
- key variable differences used in real env files (without exposing secrets)

## 3) Account and registry boundary proof

Evidence commands:

```bash
aws sts get-caller-identity
```

Capture:
- account ID used for dev deploy
- account ID used for prod deploy
- `ECR_REGISTRY` account prefix used by each environment

Expected:
- caller account matches configured `EXPECTED_AWS_ACCOUNT_ID`
- caller account matches ECR registry account prefix

## 4) Cluster boundary proof

Evidence commands:

```bash
aws eks list-clusters --region us-east-1
kubectl config current-context
```

Capture:
- cluster/context used by dev workflow
- cluster/context used by prod workflow (if separate)

## 5) Secrets boundary proof

Capture:
- GitHub environment-level secrets are separated for `dev` and `prod`
- no plaintext credentials in repo (`terraform.tfvars`, `.tfstate` files blocked in CI)

Reference CI control:
- `CI` workflow step: "Block committed sensitive infra files"

## 6) Final checklist

- [ ] Deploy workflows run under separate GitHub environments (`dev`, `prod`)
- [ ] Account/registry boundary checks enabled and passing
- [ ] Env-specific Terraform variable files used
- [ ] Cluster context/account evidence captured
- [ ] Secret handling evidence captured

## 7) Private admin path proof (internal-only)

Implemented controls:
- Terraform gates private admin resources behind `enable_private_admin_path` and a non-empty VPN certificate ARN in `infra/private_admin.tf`.
- Admin ingress is explicitly internal ALB only in `k8s/admin-private-ingress.yaml`:
  - `kubernetes.io/ingress.class: alb`
  - `alb.ingress.kubernetes.io/scheme: internal`
- Admin service is `ClusterIP` in `k8s/admin-service.yaml` (not internet exposed).

Evidence commands:

```bash
# Terraform plan with private admin enabled (use your real prod tfvars)
terraform -chdir=infra plan -var-file=envs/prod.tfvars

# Validate ingress and service are internal-only
kubectl get ingress admin-private -o yaml
kubectl get svc admin -o yaml

# Get ALB hostname created for admin ingress
kubectl get ingress admin-private -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

Capture:
- Terraform plan snippet showing `aws_ec2_client_vpn_endpoint` and related VPN resources to be created/enabled.
- Ingress YAML snippet showing `alb.ingress.kubernetes.io/scheme: internal`.
- Service YAML snippet showing `type: ClusterIP`.
- AWS EC2/ELB console screenshot showing admin ALB is `internal` and not internet-facing.
- One negative test note: admin URL is unreachable from public internet but reachable only from VPN-connected client.

Expected pass criteria:
- Admin path has no public Route53 record.
- Admin ALB is internal scheme.
- Admin service remains ClusterIP-only.
- Access requires VPN/private network path.
