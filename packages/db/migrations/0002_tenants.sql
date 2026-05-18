-- Migration 0002: tenants.
-- The root tenancy boundary. Tenants table is NOT RLS-protected; platform-admin only.

BEGIN;

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL,
    tier            tenant_tier NOT NULL DEFAULT 'property',
    billing_reference TEXT NULL,
    data_residency  data_residency NOT NULL DEFAULT 'eu',
    status          tenant_status NOT NULL DEFAULT 'provisioning',
    contract_start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    contract_end_at TIMESTAMPTZ NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_system TEXT NULL
);

CREATE UNIQUE INDEX tenants_slug_uniq ON tenants (slug);
CREATE INDEX tenants_active_idx ON tenants (status) WHERE status = 'active';

COMMENT ON TABLE  tenants IS 'Root tenancy boundary. One row per paying customer group.';
COMMENT ON COLUMN tenants.data_residency IS 'Controls which storage region tenant data lives in.';
COMMENT ON COLUMN tenants.tier IS 'Commercial tier; gates feature flags and pricing.';

COMMIT;
