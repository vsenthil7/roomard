-- Migration 0005: guests, stays.

BEGIN;

-- ====================================================================================
-- guests — Longitudinal guest entity. One row per natural person within a tenant.
-- ====================================================================================
CREATE TABLE guests (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_name                TEXT NULL,
    email_lower                 TEXT NULL,
    phone_e164                  TEXT NULL,
    home_country_code           CHAR(2) NULL,
    home_postcode               TEXT NULL,
    date_of_birth               DATE NULL,
    name_variants               TEXT[] NOT NULL DEFAULT '{}',
    pms_guest_ids               JSONB NOT NULL DEFAULT '{}'::jsonb,
    loyalty_tiers               JSONB NOT NULL DEFAULT '{}'::jsonb,
    attention_flags             JSONB NOT NULL DEFAULT '[]'::jsonb,
    processing_restrictions     JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ NULL,
    CONSTRAINT guests_country_code_format CHECK (
        home_country_code IS NULL OR home_country_code ~ '^[A-Z]{2}$'
    )
);

-- Indexes per Data Model §5.1.
CREATE INDEX guests_tenant_email_idx
    ON guests (tenant_id, email_lower)
    WHERE email_lower IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX guests_tenant_phone_idx
    ON guests (tenant_id, phone_e164)
    WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX guests_tenant_name_trgm_idx
    ON guests USING gin (tenant_id, display_name gin_trgm_ops)
    WHERE deleted_at IS NULL;
CREATE INDEX guests_name_variants_idx
    ON guests USING gin (name_variants)
    WHERE deleted_at IS NULL;
CREATE INDEX guests_pms_ids_idx ON guests USING gin (pms_guest_ids);
CREATE INDEX guests_last_seen_idx ON guests (tenant_id, last_seen_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE  guests IS 'Longitudinal guest entity. Cross-property identity resolution merges rows here.';
COMMENT ON COLUMN guests.pms_guest_ids IS 'Map of {pms_provider: external_id} per PMS.';
COMMENT ON COLUMN guests.processing_restrictions IS 'GDPR Article 18 flags; respected by all services.';

-- ====================================================================================
-- stays — One row per booking. Sourced from PMS.
-- ====================================================================================
CREATE TABLE stays (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    guest_id            UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
    pms_booking_id      TEXT NOT NULL,
    pms_provider        TEXT NOT NULL,
    room_number         TEXT NULL,
    arrival_at          TIMESTAMPTZ NOT NULL,
    departure_at        TIMESTAMPTZ NOT NULL,
    actual_check_in_at  TIMESTAMPTZ NULL,
    actual_check_out_at TIMESTAMPTZ NULL,
    booking_channel     TEXT NULL,
    rate_amount         NUMERIC(12,2) NULL,
    rate_currency       CHAR(3) NULL,
    status              stay_status NOT NULL DEFAULT 'confirmed',
    notes               TEXT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stays_departure_after_arrival CHECK (departure_at >= arrival_at)
);

CREATE UNIQUE INDEX stays_tenant_pms_booking_uniq
    ON stays (tenant_id, pms_provider, pms_booking_id);
CREATE INDEX stays_property_arrival_idx ON stays (tenant_id, property_id, arrival_at);
CREATE INDEX stays_guest_history_idx ON stays (tenant_id, guest_id, arrival_at DESC);
CREATE INDEX stays_active_idx ON stays (status)
    WHERE status IN ('confirmed', 'checked_in');
CREATE INDEX stays_arrival_today_idx ON stays (arrival_at)
    WHERE status IN ('confirmed', 'checked_in');

COMMIT;
