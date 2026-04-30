# AWS Load Balancer Controller Runbook

This runbook codifies the setup required for ALB-backed Kubernetes ingress (including private admin ingress).

## Prerequisites

- AWS CLI authenticated to target account
- `kubectl` context set to target EKS cluster
- Permissions to create IAM policy/role and update EKS resources

## One-command installation

From repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-alb-controller.ps1 `
  -ClusterName "shopcloud-cluster" `
  -Region "us-east-1" `
  -VpcId "vpc-REPLACE_ME"
```

## What the script does

- Installs `cert-manager` (required for controller webhooks)
- Creates/reuses IAM policy for ALB controller
- Creates/reuses IRSA role for service account `kube-system/aws-load-balancer-controller`
- Installs AWS Load Balancer Controller manifests
- Installs ALB `IngressClass` resources
- Annotates service account with IRSA role
- Patches controller args with:
  - cluster name
  - region
  - vpc id
- Restarts and waits for successful rollout

## Validation checklist

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
kubectl get ingressclass alb
kubectl describe ingress admin-private
```

Expected:

- Controller pod is `Running`
- `IngressClass` named `alb` exists
- Admin ingress reconciles and shows internal ALB hostname

## Security note

Use least-privilege IAM policy for the controller. Avoid temporary broad policies (for example `AdministratorAccess`) except for emergency unblock; replace immediately after.
