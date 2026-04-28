# Rollback Runbook

This runbook describes how to rollback a failed production deployment.

## Preconditions

- A previously known stable image tag exists in the container registry.
- Production deployment is managed through `.github/workflows/deploy-prod.yml`.
- `prod` GitHub environment protections are enabled (recommended).

## Rollback Steps

1. Identify the last stable image tag (example: commit SHA `abc1234`).
2. Open GitHub Actions and run **Deploy Prod** manually.
3. Set `image_tag` to the stable tag from step 1.
4. Wait until deployment job finishes.
5. Run post-deployment verification:
   - Check service health endpoints.
   - Execute smoke checks for critical user flow (catalog -> cart -> checkout).
6. Confirm incident is resolved and update deployment notes.

## Fast Verification Checklist

- `catalog` health responds `ok`
- `cart` health responds `ok`
- `checkout` health responds `ok`
- `auth` health responds `ok`
- `admin` health responds `ok`
- invoice processing still works for new checkouts

## Notes

- Keep release notes with image tags for easier rollback decisions.
- Roll forward with a hotfix after rollback when root cause is identified.
