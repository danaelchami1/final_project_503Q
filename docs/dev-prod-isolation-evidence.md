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
