param(
  [Parameter(Mandatory = $true)]
  [string]$ClusterName,

  [Parameter(Mandatory = $true)]
  [string]$VpcId,

  [string]$Region = "us-east-1",
  [string]$Namespace = "kube-system",
  [string]$ServiceAccountName = "aws-load-balancer-controller",
  [string]$RoleName = "shopcloud-alb-controller-irsa",
  [string]$PolicyName = "AWSLoadBalancerControllerIAMPolicy",
  [string]$ControllerVersion = "v2.5.4",
  [string]$CertManagerVersion = "v1.15.1"
)

$ErrorActionPreference = "Stop"

Write-Host "Starting ALB controller installation for cluster: $ClusterName" -ForegroundColor Cyan

$identity = aws sts get-caller-identity | ConvertFrom-Json
$accountId = $identity.Account
if (-not $accountId) {
  throw "Unable to resolve AWS account id."
}

$cluster = aws eks describe-cluster --name $ClusterName --region $Region | ConvertFrom-Json
$issuerUrl = $cluster.cluster.identity.oidc.issuer
if (-not $issuerUrl) {
  throw "OIDC issuer URL not found on cluster."
}

$oidcProviderHost = $issuerUrl -replace "^https://", ""
$oidcProviderArn = "arn:aws:iam::$accountId:oidc-provider/$oidcProviderHost"

Write-Host "Installing cert-manager..." -ForegroundColor Yellow
kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/$CertManagerVersion/cert-manager.yaml"
kubectl wait --for=condition=Available deployment/cert-manager-webhook -n cert-manager --timeout=240s

$policyDocPath = Join-Path $PSScriptRoot "aws-load-balancer-controller-iam-policy.json"
if (-not (Test-Path $policyDocPath)) {
  Write-Host "Downloading ALB controller IAM policy document..." -ForegroundColor Yellow
  Invoke-WebRequest `
    -Uri "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json" `
    -OutFile $policyDocPath
}

$policyArn = aws iam list-policies `
  --scope Local `
  --query "Policies[?PolicyName=='$PolicyName'].Arn | [0]" `
  --output text

if (-not $policyArn -or $policyArn -eq "None") {
  Write-Host "Creating IAM policy: $PolicyName" -ForegroundColor Yellow
  $createPolicyJson = aws iam create-policy `
    --policy-name $PolicyName `
    --policy-document ("file://$policyDocPath")
  $policyArn = ($createPolicyJson | ConvertFrom-Json).Policy.Arn
} else {
  Write-Host "IAM policy already exists: $policyArn" -ForegroundColor Green
}

$trustPolicyPath = Join-Path $PSScriptRoot "alb-controller-trust-policy.json"
@"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$oidcProviderArn"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "$oidcProviderHost`:sub": "system:serviceaccount:$Namespace:$ServiceAccountName",
          "$oidcProviderHost`:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
"@ | Set-Content -Encoding UTF8 $trustPolicyPath

$roleArn = aws iam get-role --role-name $RoleName --query "Role.Arn" --output text 2>$null
if (-not $roleArn) {
  Write-Host "Creating IAM role: $RoleName" -ForegroundColor Yellow
  $createRoleJson = aws iam create-role `
    --role-name $RoleName `
    --assume-role-policy-document ("file://$trustPolicyPath")
  $roleArn = ($createRoleJson | ConvertFrom-Json).Role.Arn
} else {
  Write-Host "IAM role already exists: $roleArn" -ForegroundColor Green
}

Write-Host "Attaching policy to role..." -ForegroundColor Yellow
aws iam attach-role-policy --role-name $RoleName --policy-arn $policyArn | Out-Null

Write-Host "Installing ALB controller manifests..." -ForegroundColor Yellow
kubectl apply -f "https://github.com/kubernetes-sigs/aws-load-balancer-controller/releases/download/$ControllerVersion/v2_5_4_full.yaml"
kubectl apply -f "https://github.com/kubernetes-sigs/aws-load-balancer-controller/releases/download/$ControllerVersion/v2_5_4_ingclass.yaml"

Write-Host "Annotating service account with IRSA role..." -ForegroundColor Yellow
kubectl annotate serviceaccount $ServiceAccountName `
  -n $Namespace `
  "eks.amazonaws.com/role-arn=$roleArn" `
  --overwrite

$patchObj = @{
  spec = @{
    template = @{
      spec = @{
        containers = @(
          @{
            name = "controller"
            args = @(
              "--cluster-name=$ClusterName"
              "--ingress-class=alb"
              "--aws-region=$Region"
              "--aws-vpc-id=$VpcId"
            )
          }
        )
      }
    }
  }
} | ConvertTo-Json -Depth 8

Write-Host "Patching ALB controller args..." -ForegroundColor Yellow
kubectl patch deployment aws-load-balancer-controller -n $Namespace -p $patchObj

Write-Host "Waiting for ALB controller rollout..." -ForegroundColor Yellow
kubectl rollout restart deployment/aws-load-balancer-controller -n $Namespace
kubectl rollout status deployment/aws-load-balancer-controller -n $Namespace --timeout=240s

Remove-Item $trustPolicyPath -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "ALB controller installation complete." -ForegroundColor Green
Write-Host "Next validation command:" -ForegroundColor Cyan
Write-Host "kubectl get pods -n $Namespace -l app.kubernetes.io/name=aws-load-balancer-controller"
