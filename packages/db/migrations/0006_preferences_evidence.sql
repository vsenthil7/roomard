-- Migration 0006: preferences, evidence, kind-specific evidence subtables.
-- The spine of the product per BRD §1 and Data Model §5.3.

BEGIN;

-- ====================================================================================
-- evidence — Polymorphic parent for all evidence sources.
-- One row per evidence item; subtables hold kind-specific fields.
-- ====================================================================================
CREATE TABLE evidence (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    guest_id            UUID NULL REFERENCES guests(id) ON DELETE SET NULL,
    property_id         UUID NULL REFERENCES properties(id) ON DELETE SET NULL,
    stay_id             UUID NULL REFERENCES stays(id) ON DELETE SET NULL,
    kind                evidence_kind NOT NULL,
    status              evidence_status NOT NULL DEFAULT 'pending',
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    captured_by         UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    captured_by_system  TEXT NULL,
    object_ref          TEXT NULL,
    confidence          NUMERIC(4,3) NULL,
    raw_text            TEXT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT evidence_confidence_range CHECK (
        confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
    )
);

CREATE INDEX evidence_tenant_guest_idx ON evidence (tenant_id, guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX evidence_tenant_kind_idx ON evidence (tenant_id, kind);
CREATE INDEX evidence_tenant_status_idx ON evidence (tenant_id, status);
CREATE INDEX evidence_property_idx ON evidence (property_id) WHERE property_id IS NOT NULL;
CREATE INDEX evidence_occurred_at_idx ON evidence (tenant_id, occurred_at DESC);
CREATE INDEX evidence_low_confidence_idx ON evidence (tenant_id, confidence)
    WHERE confidence IS NOT NULL AND confidence < 0.75 AND status = 'processed';

COMMENT ON COLUMN evidence.object_ref IS 'Object store URI (e.g. s3://bucket/key) for the original artefact.';
COMMENT ON COLUMN evidence.confidence IS 'OCR/transcription/link confidence as 0..1.';

-- ====================================================================================
-- card_captures — Subtype: photographed preference card.
-- ====================================================================================
CREATE TABLE card_captures (
    evidence_id         UUID PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    image_object_ref    TEXT NOT NULL,
    image_width_px      INTEGER NULL,
    image_height_px     INTEGER NULL,
    ocr_provider        TEXT NULL,
    ocr_language        TEXT NULL,
    ocr_confidence      NUMERIC(4,3) NULL,
    extracted_fields    JSONB NOT NULL DEFAULT '{}'::jsonb,
    handwriting_detected BOOLEAN NOT NULL DEFAULT false,
    processed_at        TIMESTAMPTZ NULL,
    CONSTRAINT card_captures_ocr_confidence_range CHECK (
        ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)
    )
);

CREATE INDEX card_captures_tenant_idx ON card_captures (tenant_id);

-- ====================================================================================
-- voice_memos — Subtype: voice memo recording.
-- ====================================================================================
CREATE TABLE voice_memos (
    evidence_id         UUID PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    audio_object_ref    TEXT NOT NULL,
    duration_seconds    NUMERIC(8,2) NULL,
    transcript          TEXT NULL,
    transcription_confidence NUMERIC(4,3) NULL,
    transcription_language TEXT NULL,
    processed_at        TIMESTAMPTZ NULL
);

CREATE INDEX voice_memos_tenant_idx ON voice_memos (tenant_id);

-- ====================================================================================
-- fb_tickets — Subtype: food & beverage ticket photo or PMS-sourced.
-- ====================================================================================
CREATE TABLE fb_tickets (
    evidence_id         UUID PRIMARY KEY REFERENCES evidence(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    image_object_ref    TEXT NULL,
    ticket_number       TEXT NULL,
    outlet              TEXT NULL,
    served_at           TIMESTAMPTZ NULL,
    items               JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount        NUMERIC(12,2) NULL,
    total_currency      CHAR(3) NULL,
    notes               TEXT NULL,
    processed_at        TIMESTAMPTZ NULL
);

CREATE INDEX fb_tickets_tenant_idx ON fb_tickets (tenant_id);
CREATE INDEX fb_tickets_served_idx ON fb_tickets (served_at) WHERE served_at IS NOT NULL;

-- ====================================================================================
-- preferences — One row per atomic preference fact about a guest.
-- ====================================================================================
CREATE TABLE preferences (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    guest_id            UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
    kind                preference_kind NOT NULL,
    polarity            preference_polarity NOT NULL,
    detail              TEXT NOT NULL,
    confidence          NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    status              preference_status NOT NULL DEFAULT 'active',
    supersedes_id       UUID NULL REFERENCES preferences(id) ON DELETE SET NULL,
    first_observed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_reinforced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reinforcement_count INTEGER NOT NULL DEFAULT 1,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT preferences_confidence_range CHECK (
        confidence >= 0 AND confidence <= 1
    )
);

CREATE INDEX preferences_tenant_guest_idx
    ON preferences (tenant_id, guest_id, status, kind);
CREATE INDEX preferences_active_idx
    ON preferences (tenant_id, guest_id)
    WHERE status = 'active';
CREATE INDEX preferences_supersedes_idx
    ON preferences (supersedes_id) WHERE supersedes_id IS NOT NULL;

COMMENT ON COLUMN preferences.detail IS 'Free-text detail, e.g. "feather pillows, two stacked".';
COMMENT ON COLUMN preferences.confidence IS 'Confidence in this preference as 0..1.';

-- ====================================================================================
-- preference_evidence — Many-to-many: preferences backed by evidence items.
-- ====================================================================================
CREATE TABLE preference_evidence (
    preference_id   UUID NOT NULL REFERENCES preferences(id) ON DELETE CASCADE,
    evidence_id     UUID NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    weight          NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (preference_id, evidence_id),
    CONSTRAINT pref_evidence_weight_range CHECK (weight >= 0 AND weight <= 1)
);

CREATE INDEX preference_evidence_evidence_idx ON preference_evidence (evidence_id);
CREATE INDEX preference_evidence_tenant_idx ON preference_evidence (tenant_id);

COMMIT;
