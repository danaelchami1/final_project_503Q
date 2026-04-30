# ShopCloud On-Call Runbook

This runbook defines first-response steps for ShopCloud operational alerts.

## Alert channels

- CloudWatch alarms publish to SNS topic configured by:
  - `alarm_notification_topic_arn` (external topic), or
  - `enable_alarm_notifications=true` (project-managed topic)
- Email subscribers are configured with `alarm_notification_emails`.

## Severity model

- `SEV-2`: user-visible degradation with partial service availability
- `SEV-1`: checkout path blocked or production outage

## Initial triage checklist (first 10 minutes)

1. Confirm alarm name and timestamp in CloudWatch.
2. Check current service and node health:
   - `kubectl get nodes`
   - `kubectl get pods -A`
   - `kubectl get deployments`
3. Check affected service logs:
   - `kubectl logs deployment/checkout --tail=150`
   - `kubectl logs deployment/cart --tail=150`
   - `kubectl logs deployment/invoice-worker --tail=150`
4. Decide severity:
   - escalate to `SEV-1` if checkout end-to-end is unavailable.

## Alarm-specific actions

### Invoice queue depth high

- Alarm: `invoice_queue_depth_high`
- Check:
  - `invoice-worker` health/logs
  - SQS approximate visible messages
- Action:
  - restart `invoice-worker` deployment if stuck
  - verify queue credentials/IRSA access

### Invoice DLQ depth high

- Alarm: `invoice_dlq_depth_high`
- Check:
  - inspect failed message payload format
  - worker parsing/validation logs
- Action:
  - fix payload or worker parser
  - redrive messages after fix

### Invoice oldest message age high

- Alarm: `invoice_queue_oldest_message_age_high`
- Check:
  - worker polling status
  - node scheduling capacity
- Action:
  - increase worker replicas (if capacity allows)
  - resolve cluster scheduling pressure

### Orders DB CPU high

- Alarm: `orders_db_cpu_high`
- Check:
  - active checkout traffic
  - RDS metrics (CPU, connections, read/write latency)
- Action:
  - reduce traffic burst where possible
  - scale DB class or enable HA profile in target env

## Validation after mitigation

1. Re-run service health checks.
2. Trigger one synthetic checkout:
   - add cart item
   - submit checkout
3. Confirm queue/worker flow and no new DLQ growth.
4. Ensure alarm returns to `OK`.

## Post-incident notes

Document:
- trigger and timeline
- root cause
- mitigation taken
- follow-up infra/code tasks
