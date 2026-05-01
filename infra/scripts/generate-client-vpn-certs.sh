#!/usr/bin/env bash
# Self-signed material for AWS Client VPN mutual authentication (dev/lab).
# Run from Git Bash or WSL. Requires openssl. Do not commit the output directory.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/../.vpn-certs-generated"
mkdir -p "$OUT"
cd "$OUT"

echo "Writing keys and certs to $OUT"

openssl genrsa -out ca.key 2048
# Leading // so MSYS/Git Bash does not treat -subj DN slashes as paths (Windows).
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "//CN=ca.vpn.shopcloud.internal"

openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "//CN=vpn.server.shopcloud.internal"
# ACM / Client VPN require an FQDN (dot in CN or SAN).
cat >server.ext <<'EOF'
subjectAltName=DNS:vpn.server.shopcloud.internal
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -sha256 -extfile server.ext
rm -f server.ext

openssl genrsa -out client.key 2048
openssl req -new -key client.key -out client.csr \
  -subj "//CN=vpn.client.shopcloud.internal"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out client.crt -days 825 -sha256

rm -f ./*.csr ./*.srl
chmod 600 *.key

echo ""
echo "Next: import into ACM (same region as the Client VPN endpoint, e.g. us-east-1):"
echo ""
echo "  export AWS_REGION=us-east-1"
echo "  SERVER_ARN=\$(aws acm import-certificate \\"
echo "    --certificate fileb://server.crt --private-key fileb://server.key \\"
echo "    --certificate-chain fileb://ca.crt \\"
echo "    --region \"\$AWS_REGION\" --query CertificateArn --output text)"
echo "  CLIENT_CA_ARN=\$(aws acm import-certificate \\"
echo "    --certificate fileb://ca.crt --private-key fileb://ca.key \\"
echo "    --region \"\$AWS_REGION\" --query CertificateArn --output text)"
echo ""
echo "Set in Terraform (then terraform apply):"
echo "  enable_private_admin_path                  = true"
echo "  admin_vpn_server_certificate_arn           = <SERVER_ARN>"
echo "  admin_vpn_client_root_certificate_chain_arn = <CLIENT_CA_ARN>"
echo ""
echo "After apply, download the Client VPN endpoint configuration from the AWS console,"
echo "merge client.crt + client.key into the profile (see AWS mutual auth docs), connect,"
echo "then open the internal admin ALB URL from kubectl: kubectl get ingress admin-private"
