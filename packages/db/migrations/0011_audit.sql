-- Migration 0011: audit_events — append-only audit log with hash chain.
-- Per BRD §15 (audit-first) and Architecture §3.1 (AuditSvc).

BEGIN;

-- ====================================================================================
-- audit_events — Append-only. Trigger blocks UPDATE/DELETE.
-- ====================================================================================
CREATE TABLE audit_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,        -- No FK: must survive tenant deletion
    actor_kind          audit_actor_kind NOT NULL,
    actor_id            UUID NULL,             -- User UUID if user; system name for system actors
    actor_display       TEXT NULL,
    operation           audit_operation NOT NULL,
    resource_kind       TEXT NOT NULL,         -- e.g. 'guest', 'preference', 'brief'
    resource_id         UUID NULL,
    data_class          data_class NULL,
    request_id          UUID NULL,
    ip_inet             INET NULL,
    user_agent          TEXT NULL,
    detail              JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash       BYTEA NULL,            -- Hash of previous audit event in this tenant
    event_hash          BYTEA NOT NULL,        -- Hash of this event
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX audit_events_resource_idx
    ON audit_events (tenant_id, resource_kind, resource_id, occurred_at DESC)
    WHERE resource_id IS NOT NULL;
CREATE INDEX audit_events_actor_idx
    ON audit_events (tenant_id, actor_id, occurred_at DESC)
    WHERE actor_id IS NOT NULL;
CREATE INDEX audit_events_operation_idx
    ON audit_events (tenant_id, operation, occurred_at DESC);
CREATE INDEX audit_events_request_idx
    ON audit_events (request_id) WHERE request_id IS NOT NULL;

-- Partition target: monthly partitions on occurred_at; deferred to Sprint 8 per DM-02.
-- The current implementation is a single table; partitioning will be added without app changes.

-- ====================================================================================
-- Append-only enforcement.
-- audit_events is INSERT-only. UPDATE and DELETE are blocked at the trigger level.
-- The only way to "fix" an audit row is to INSERT a correction record, never to modify.
-- ====================================================================================
CREATE OR REPLACE FUNCTION audit_block_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only; UPDATE/DELETE not permitted'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_block_update
    BEFORE UPDATE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_block_modification();

CREATE TRIGGER audit_block_delete
    BEFORE DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_block_modification();

-- ====================================================================================
-- Hash chain population trigger.
-- Each event references the previous event's hash, creating a tamper-evident chain.
-- ====================================================================================
CREATE OR REPLACE FUNCTION audit_compute_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    prev_hash BYTEA;
    canonical TEXT;
BEGIN
    SELECT event_hash INTO prev_hash
    FROM audit_events
    WHERE tenant_id = NEW.tenant_id
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1;

    NEW.previous_hash := prev_hash;

    canonical := concat_ws('|',
        NEW.id::text,
        NEW.tenant_id::text,
        NEW.actor_kind::text,
        COALESCE(NEW.actor_id::text, ''),
        NEW.operation::text,
        NEW.resource_kind,
        COALESCE(NEW.resource_id::text, ''),
        COALESCE(NEW.data_class::text, ''),
        NEW.occurred_at::text,
        encode(COALESCE(prev_hash, ''::bytea), 'hex')
    );

    NEW.event_hash := digest(canonical, 'sha256');
    RETURN NEW;
END;
$$;

CREATE TRIGGER audit_set_hash
    BEFORE INSERT ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_compute_hash();

COMMENT ON FUNCTION audit_block_modification IS 'Enforces audit_events append-only invariant.';
COMMENT ON FUNCTION audit_compute_hash IS 'Computes tamper-evident hash chain per tenant.';

COMMIT;
