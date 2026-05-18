-- Migration 0007: issues, fb_records.

BEGIN;

-- ====================================================================================
-- issues — Complaints, incidents, special requests per stay.
-- ====================================================================================
CREATE TABLE issues (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stay_id         UUID NULL REFERENCES stays(id) ON DELETE SET NULL,
    guest_id        UUID NULL REFERENCES guests(id) ON DELETE SET NULL,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    category        TEXT NOT NULL,
    severity        SMALLINT NOT NULL DEFAULT 1,
    summary         TEXT NOT NULL,
    detail          TEXT NULL,
    raised_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ NULL,
    resolved_by     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT NULL,
    source_evidence_id UUID NULL REFERENCES evidence(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT issues_severity_range CHECK (severity BETWEEN 1 AND 5)
);

CREATE INDEX issues_tenant_guest_idx ON issues (tenant_id, guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX issues_tenant_property_idx ON issues (tenant_id, property_id);
CREATE INDEX issues_open_idx ON issues (tenant_id, raised_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX issues_severity_idx ON issues (severity) WHERE resolved_at IS NULL;

-- ====================================================================================
-- fb_records — Aggregated food & beverage history per guest.
-- ====================================================================================
CREATE TABLE fb_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    guest_id        UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    stay_id         UUID NULL REFERENCES stays(id) ON DELETE SET NULL,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    outlet          TEXT NULL,
    item            TEXT NOT NULL,
    quantity        NUMERIC(8,2) NOT NULL DEFAULT 1,
    served_at       TIMESTAMPTZ NULL,
    amount          NUMERIC(12,2) NULL,
    currency        CHAR(3) NULL,
    evidence_id     UUID NULL REFERENCES evidence(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX fb_records_tenant_guest_idx ON fb_records (tenant_id, guest_id);
CREATE INDEX fb_records_stay_idx ON fb_records (stay_id) WHERE stay_id IS NOT NULL;

COMMIT;
