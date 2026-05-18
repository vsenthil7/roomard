-- Migration 0008: briefs, brief_items, housekeeping_prep.

BEGIN;

-- ====================================================================================
-- briefs — Daily arrival brief per property.
-- ====================================================================================
CREATE TABLE briefs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    brief_date          DATE NOT NULL,
    status              brief_status NOT NULL DEFAULT 'generating',
    summary             TEXT NULL,
    narrative_html      TEXT NULL,
    item_count          INTEGER NOT NULL DEFAULT 0,
    vip_count           INTEGER NOT NULL DEFAULT 0,
    attention_count     INTEGER NOT NULL DEFAULT 0,
    generated_at        TIMESTAMPTZ NULL,
    delivered_at        TIMESTAMPTZ NULL,
    prompt_version      TEXT NULL,
    generation_duration_ms INTEGER NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX briefs_tenant_property_date_uniq
    ON briefs (tenant_id, property_id, brief_date);
CREATE INDEX briefs_property_date_idx ON briefs (property_id, brief_date DESC);
CREATE INDEX briefs_pending_delivery_idx ON briefs (status)
    WHERE status IN ('generating', 'ready');

-- ====================================================================================
-- brief_items — One row per arriving guest in a daily brief.
-- ====================================================================================
CREATE TABLE brief_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    brief_id            UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
    guest_id            UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    stay_id             UUID NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    priority            brief_item_priority NOT NULL DEFAULT 'standard',
    sort_index          INTEGER NOT NULL DEFAULT 0,
    preference_summary  TEXT NULL,
    say_this_suggestion TEXT NULL,
    history_summary     TEXT NULL,
    attention_notes     TEXT NULL,
    raw_payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX brief_items_brief_idx ON brief_items (brief_id, sort_index);
CREATE INDEX brief_items_tenant_guest_idx ON brief_items (tenant_id, guest_id);
CREATE INDEX brief_items_priority_idx ON brief_items (brief_id, priority);

COMMENT ON COLUMN brief_items.say_this_suggestion IS 'Concrete sentence front-desk can say. The magic moment per BRD.';

-- ====================================================================================
-- housekeeping_prep — Pre-arrival prep cards per stay.
-- ====================================================================================
CREATE TABLE housekeeping_prep (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stay_id             UUID NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    status              prep_status NOT NULL DEFAULT 'pending',
    instructions        JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_to         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    completed_at        TIMESTAMPTZ NULL,
    completed_by        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX housekeeping_prep_stay_uniq ON housekeeping_prep (stay_id);
CREATE INDEX housekeeping_prep_property_status_idx
    ON housekeeping_prep (property_id, status);

COMMIT;
