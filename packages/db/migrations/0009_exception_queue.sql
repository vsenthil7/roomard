-- Migration 0009: exception_queue_items, identity_merge_candidates.

BEGIN;

-- ====================================================================================
-- exception_queue_items — Cross-source exception queue per UC-23.
-- ====================================================================================
CREATE TABLE exception_queue_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id         UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
    kind                exception_kind NOT NULL,
    status              exception_status NOT NULL DEFAULT 'open',
    title               TEXT NOT NULL,
    detail              TEXT NULL,
    evidence_id         UUID NULL REFERENCES evidence(id) ON DELETE SET NULL,
    guest_id            UUID NULL REFERENCES guests(id) ON DELETE SET NULL,
    payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    severity            SMALLINT NOT NULL DEFAULT 2,
    assigned_to         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    resolved_at         TIMESTAMPTZ NULL,
    resolved_by         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    resolution          TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT exception_severity_range CHECK (severity BETWEEN 1 AND 5)
);

CREATE INDEX exception_queue_open_idx
    ON exception_queue_items (tenant_id, property_id, status, severity DESC)
    WHERE status IN ('open', 'in_progress');
CREATE INDEX exception_queue_assigned_idx
    ON exception_queue_items (assigned_to)
    WHERE assigned_to IS NOT NULL AND status IN ('open', 'in_progress');
CREATE INDEX exception_queue_kind_idx ON exception_queue_items (tenant_id, kind, status);
CREATE INDEX exception_queue_evidence_idx
    ON exception_queue_items (evidence_id) WHERE evidence_id IS NOT NULL;

-- ====================================================================================
-- identity_merge_candidates — Pairs of guest rows suspected to be the same person.
-- ====================================================================================
CREATE TABLE identity_merge_candidates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    guest_id_a          UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    guest_id_b          UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    confidence          NUMERIC(4,3) NOT NULL,
    signals             JSONB NOT NULL DEFAULT '{}'::jsonb,
    decided_at          TIMESTAMPTZ NULL,
    decided_by          UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    decision            TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT identity_merge_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT identity_merge_distinct CHECK (guest_id_a <> guest_id_b)
);

CREATE INDEX identity_merge_pending_idx
    ON identity_merge_candidates (tenant_id, created_at DESC)
    WHERE decided_at IS NULL;
CREATE INDEX identity_merge_guests_idx
    ON identity_merge_candidates (tenant_id, guest_id_a, guest_id_b);

COMMIT;
