# Roomard Operations Runbook

This runbook covers day-to-day operational scenarios for Roomard in production
and pre-production environments. It is written for an SRE on call without prior
familiarity with the system.

---

## 1. Service inventory

| Service        | Port (local) | Health endpoint     | Critical dependencies          |
|----------------|--------------|---------------------|--------------------------------|
| api-gateway    | 3000         | `GET /health`       | All internal services, Redis   |
| auth           | 3001         | `GET /health`       | Postgres                       |
| tenant         | 3002         | `GET /health`       | Postgres                       |
| guest          | 3003         | `GET /health`       | Postgres, ai-gateway           |
| capture        | 3004         | `GET /health`       | Postgres, S3, ai-gateway       |
| brief          | 3005         | `GET /health`       | Postgres, ai-gateway           |
| exception      | 3006         | `GET /health`       | Postgres                       |
| audit          | 3007         | `GET /health`       | Postgres                       |
| ai-gateway     | 3008         | `GET /health`       | Qianfan API (or mock)          |
| ingest         | 3009         | `GET /health`       | Postgres                       |

---

## 2. Common operations

### 2.1 Boot the local stack

```bash
make up         # docker compose up Postgres / Redis / MinIO / Mailpit
make db-migrate # apply migrations
make db-seed    # demo tenant + users
make dev        # start all Node services in parallel
```

### 2.2 Roll the database forward

```bash
pnpm --filter @roomard/db migrate
```

Migrations are SHA-256 checksum-tracked. Any modification to an applied
migration is refused. To revert a single migration in development:

```bash
pnpm --filter @roomard/db migrate:down
```

Production: `migrate:down` is **disabled**. Roll forward only.

### 2.3 Inspect the audit chain

```bash
psql $DATABASE_URL -c "
  SELECT id, occurred_at, actor_kind, operation, resource_type, resource_id
  FROM audit_events
  WHERE tenant_id = '<TENANT_UUID>'
  ORDER BY occurred_at DESC LIMIT 50;
"
```

To verify the chain integrity (returns `ok=true`):

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.roomard.com/v1/audit/verify?from=2026-05-01&to=2026-05-31"
```

A non-`ok` response is a P1 incident — see §4.3.

### 2.4 Force a brief regeneration

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"propertyId":"<UUID>","briefDate":"2026-05-19","force":true}' \
  https://api.roomard.com/v1/briefs/generate
```

### 2.5 Replay queued offline captures

The web client replays automatically on `online` event. To manually drain:

```js
// In the browser console while signed in
const { listQueuedCaptures } = await import('/src/lib/offline-queue.js');
console.table(await listQueuedCaptures());
```

---

## 3. Deployment

### 3.1 Required secrets (per environment)

| Secret name                 | Purpose                                    |
|-----------------------------|--------------------------------------------|
| `JWT_SECRET`                | HS256 signing key (≥32 bytes)              |
| `DATABASE_URL`              | Postgres connection string                 |
| `REDIS_URL`                 | Redis connection string                    |
| `OBJECT_STORE_*`            | S3/BOS bucket credentials                  |
| `QIANFAN_API_KEY`           | Baidu Qianfan API key                      |
| `QIANFAN_SECRET_KEY`        | Baidu Qianfan secret                       |
| `MEWS_WEBHOOK_SECRET`       | Default HMAC secret if not per-tenant      |
| `SENTRY_DSN`                | Error tracking                             |
| `SAML_IDP_METADATA_URL`     | OIDC/SAML IdP metadata endpoint            |

### 3.2 Deploy a new version

1. Tag the release: `git tag v0.2.0 && git push --tags`
2. CI builds 10 container images, signs them, pushes to registry
3. Helm chart in `deploy/helm` is updated with the new tag
4. `helm upgrade roomard ./deploy/helm --values prod.yaml`
5. Smoke test: `curl https://api.roomard.com/health`
6. Verify all `/health` endpoints return `{status: "ok"}`

### 3.3 Database migrations on deploy

Migrations run as a Kubernetes Job before the service pods roll. Use
`db.migrate.image: roomard/db:<tag>` in the Helm values. The job is idempotent.

---

## 4. Incidents

### 4.1 Front desk reports "Say this" is stale or missing

1. Check the `ai-gateway` /health and Qianfan circuit breaker status.
2. Check rate-limit caps: `SELECT count(*), sum(input_tokens + output_tokens)
   FROM ai_call_logs WHERE tenant_id = '<UUID>' AND created_at > now() -
   interval '1 hour'`.
3. If rate-limited, increase the per-tenant cap in `tenants.metadata`.
4. Restart the affected service: `kubectl rollout restart deployment/brief-svc`.

### 4.2 PMS webhook returning 401

1. Confirm the Mews integration row is `status=active`:
   ```sql
   SELECT * FROM integrations WHERE tenant_id = '<UUID>' AND kind = 'mews';
   ```
2. Verify `credentials_ref` resolves to a present secret in the secrets manager.
3. Rotate the webhook secret in Mews; update the secret in the vault; the
   service picks up new values within 60s.

### 4.3 Audit chain verification fails (P1)

This means the audit trail has been tampered with — treat as security incident.

1. **Do not** run any DELETE / UPDATE on audit_events.
2. Snapshot the database immediately:
   `pg_dump --table=audit_events $DATABASE_URL > audit-backup-$(date +%s).sql`
3. Page security@roomard.com. The incident lead initiates the security
   review playbook in the security wiki.
4. Continue serving traffic — the chain failure does not affect application
   correctness, only forensic integrity. The chain is read-only and lives
   alongside, not in front of, application data.

### 4.4 OCR confidence consistently below threshold

Symptom: every capture lands in exception queue with low confidence.

1. Check `paddleocr-vl` model status in Qianfan console.
2. Confirm test images aren't being passed through a downscaling middleware.
3. Lower the `ACCEPT_CONFIDENCE` env override **only as a temporary measure** —
   default 0.75. Anything below 0.6 is product-unsafe and must trigger an
   incident review.

---

## 5. Backup & recovery

### 5.1 Database backups

- Continuous WAL archiving to S3, RPO 5 min
- Daily snapshot retained 30 days
- Quarterly off-region copy retained 7 years (regulatory)

### 5.2 Restore procedure

1. Provision new Postgres instance
2. Restore latest snapshot from S3
3. Replay WAL to target timestamp
4. Update `DATABASE_URL` secret; rotate connections
5. Verify audit chain: `SELECT count(*), max(occurred_at) FROM audit_events`
6. **Do not** seed — restore the actual application data only

### 5.3 Object store

- MinIO/BOS bucket is versioned (object lock for evidence retention).
- Lifecycle policy: evidence transitions to cold storage after 90 days,
  retained 7 years.

---

## 6. Capacity planning

Sized for 50 properties, 250 active rooms each:

- API gateway: 2 vCPU, 1 GB RAM per replica, min 3 replicas
- Each backend service: 1 vCPU, 512 MB RAM per replica, min 2 replicas
- Postgres: 4 vCPU, 16 GB RAM, 100 GB SSD storage
- Redis: 1 vCPU, 2 GB RAM
- Estimated daily AI calls: ~12 k briefs + ~3 k OCR + ~1 k review-link = ~16 k

Costs (BRD §3): ~£0.018 per brief item, ~£0.045 per OCR. See `docs/cost-model.md`.

---

## 7. Contact

- On-call rota: `roomard-oncall@pagerduty`
- Security incidents: `security@roomard.com`
- Privacy & DPO: `dpo@roomard.com`
