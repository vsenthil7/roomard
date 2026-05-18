-- Migration 0004: properties, user_properties, integrations.

BEGIN;

-- ====================================================================================
-- properties — One row per physical hotel property within a tenant.
-- ====================================================================================
CREATE TABLE properties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    short_code      TEXT NOT NULL,
    address_line1   TEXT NULL,
    address_line2   TEXT NULL,
    city            TEXT NULL,
    postal_code     TEXT NULL,
    country_code    CHAR(2) NULL,
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    locale          TEXT NOT NULL DEFAULT 'en-GB',
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          tenant_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX properties_tenant_short_code_uniq ON properties (tenant_id, short_code);
CREATE INDEX properties_tenant_idx ON properties (tenant_id);
CREATE INDEX properties_country_idx ON properties (country_code) WHERE country_code IS NOT NULL;

COMMENT ON COLUMN properties.short_code IS 'Tenant-unique short identifier used in URLs and CSV exports.';

-- ====================================================================================
-- user_properties — Scope users to one or more properties.
-- ====================================================================================
CREATE TABLE user_properties (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, property_id)
);

CREATE INDEX user_properties_property_idx ON user_properties (property_id);
CREATE INDEX user_properties_tenant_idx ON user_properties (tenant_id);

-- ====================================================================================
-- integrations — PMS, review, email connections per tenant or per property.
-- ====================================================================================
CREATE TABLE integrations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id         UUID NULL REFERENCES properties(id) ON DELETE CASCADE,
    kind                integration_kind NOT NULL,
    provider            TEXT NOT NULL,
    status              integration_status NOT NULL DEFAULT 'pending',
    credentials_ref     TEXT NOT NULL,
    config              JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_sync_at        TIMESTAMPTZ NULL,
    last_sync_status    TEXT NULL,
    last_error          TEXT NULL,
    error_count         INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per Data Model §4.2: one row per (tenant, kind, property_id) for property-scoped integrations,
-- and one row per (tenant, kind) for tenant-wide integrations.
CREATE UNIQUE INDEX integrations_tenant_kind_property_uniq
    ON integrations (tenant_id, kind, property_id)
    WHERE property_id IS NOT NULL;
CREATE UNIQUE INDEX integrations_tenant_kind_global_uniq
    ON integrations (tenant_id, kind)
    WHERE property_id IS NULL;
CREATE INDEX integrations_error_idx ON integrations (status) WHERE status = 'error';
CREATE INDEX integrations_provider_idx ON integrations (provider);

COMMENT ON COLUMN integrations.credentials_ref IS 'Secrets manager reference; never raw credentials.';

COMMIT;
