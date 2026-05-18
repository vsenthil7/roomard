-- Migration 0003: users, roles, user_roles, user_properties, tenant_sso_configs.

BEGIN;

-- ====================================================================================
-- roles — Per-tenant role definitions. System roles are seeded; tenants can add custom roles.
-- ====================================================================================
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = system role
    name            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    description     TEXT NULL,
    permissions     JSONB NOT NULL DEFAULT '{}'::jsonb,
    data_classes    data_class[] NOT NULL DEFAULT '{}',
    is_system       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roles_tenant_name_uniq
    ON roles (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
CREATE INDEX roles_tenant_idx ON roles (tenant_id);

COMMENT ON COLUMN roles.permissions IS 'Resource -> actions[] map, e.g. {"guests": ["read","write"]}.';
COMMENT ON COLUMN roles.data_classes IS 'Permitted data classes per BRD §15.';

-- ====================================================================================
-- users — Staff users of the tenant.
-- ====================================================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    email_lower         TEXT GENERATED ALWAYS AS (lower(email)) STORED,
    display_name        TEXT NOT NULL,
    status              user_status NOT NULL DEFAULT 'invited',
    password_hash       TEXT NULL,             -- NULL for SSO-only users
    mfa_enrolled        BOOLEAN NOT NULL DEFAULT false,
    mfa_secret          TEXT NULL,             -- Encrypted; only present if mfa_enrolled
    last_login_at       TIMESTAMPTZ NULL,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ NULL,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX users_tenant_email_uniq
    ON users (tenant_id, email_lower)
    WHERE deleted_at IS NULL;
CREATE INDEX users_tenant_status_idx ON users (tenant_id, status) WHERE deleted_at IS NULL;

-- ====================================================================================
-- user_roles — Many-to-many assignment.
-- ====================================================================================
CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX user_roles_role_idx ON user_roles (role_id);
CREATE INDEX user_roles_tenant_idx ON user_roles (tenant_id);

-- ====================================================================================
-- tenant_sso_configs — Zero or one row per tenant.
-- ====================================================================================
CREATE TABLE tenant_sso_configs (
    tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    protocol            sso_protocol NOT NULL,
    idp_entity_id       TEXT NOT NULL,
    idp_metadata_url    TEXT NULL,
    idp_metadata_xml    TEXT NULL,
    attribute_mapping   JSONB NOT NULL,
    default_role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    jit_provisioning    BOOLEAN NOT NULL DEFAULT true,
    enforce_sso         BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sso_metadata_present
        CHECK (idp_metadata_url IS NOT NULL OR idp_metadata_xml IS NOT NULL)
);

-- ====================================================================================
-- refresh_tokens — Rotating refresh tokens with jti tracking.
-- ====================================================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ NULL,
    replaced_by UUID NULL REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    user_agent  TEXT NULL,
    ip_inet     INET NULL
);

CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX refresh_tokens_hash_uniq ON refresh_tokens (token_hash);

COMMIT;
