-- Migration 0017: application DB role (G-36 remediation).
--
-- THE PROBLEM (G-36, found CP-70): RLS is ENABLED and FORCED on every tenant
-- table (migration 0013), but a Postgres role that is SUPERUSER or has BYPASSRLS
-- *ignores RLS entirely, even under FORCE*. In dev/CI the app connects as the
-- bootstrap `roomard` role, which is a superuser with BYPASSRLS — so tenant
-- isolation is silently NOT enforced. Migrations and ops scripts are *meant* to
-- run as that privileged role (see the 0013 header comment); the APPLICATION is
-- not. The restricted application role was simply never created.
--
-- THE FIX: create `roomard_app` — LOGIN, NOSUPERUSER, NOBYPASSRLS — with exactly
-- the table privileges the services need and nothing more. Production must point
-- its DATABASE_URL at THIS role, not at the migration/superuser role, or RLS
-- provides no protection.
--
-- PRODUCTION NOTE: the password set here is a DEV-ONLY placeholder. In production,
-- after this migration runs, set the real password out-of-band from your secrets
-- manager:  ALTER ROLE roomard_app WITH PASSWORD '<from-secrets-manager>';
-- and connect the services as:
--   DATABASE_URL=postgres://roomard_app:<pwd>@<host>:5432/roomard
-- Migrations/seed/ops continue to run as the privileged bootstrap role.

BEGIN;

-- ------------------------------------------------------------------------------
-- Create the role idempotently (CREATE ROLE has no IF NOT EXISTS before PG16).
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'roomard_app') THEN
        CREATE ROLE roomard_app
            LOGIN
            NOSUPERUSER
            NOBYPASSRLS
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT
            PASSWORD 'roomard_app_dev_pwd';  -- DEV ONLY — override in production
    ELSE
        -- Ensure the security-critical attributes are correct even if the role
        -- pre-exists (e.g. created by an earlier ad-hoc script).
        ALTER ROLE roomard_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
END
$$;

-- ------------------------------------------------------------------------------
-- Schema + sequence access.
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO roomard_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO roomard_app;

-- ------------------------------------------------------------------------------
-- Table DML. Grant full CRUD across the schema, then withhold the privileges
-- that would violate invariants:
--   * audit_events is APPEND-ONLY (0011 triggers block UPDATE/DELETE anyway, but
--     we also revoke the privilege so the intent is explicit and defence-in-depth).
-- The app NEVER needs DDL, so no other privileges are granted.
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO roomard_app;
REVOKE UPDATE, DELETE ON audit_events FROM roomard_app;

-- ------------------------------------------------------------------------------
-- Future tables/sequences (migrations run as the privileged role; default privs
-- ensure new objects are reachable by the app role without another grant pass).
-- These apply to objects created BY the role running this migration.
-- ------------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO roomard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO roomard_app;

-- ------------------------------------------------------------------------------
-- Helper functions the RLS policies + audit triggers rely on must be executable
-- by the app role (current_tenant_id is STABLE and read in every policy).
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION current_tenant_id() TO roomard_app;

COMMENT ON ROLE roomard_app IS
    'Application connection role. NOSUPERUSER NOBYPASSRLS so RLS (migration 0013) is actually enforced. Production DATABASE_URL must use this role; migrations/ops use the privileged bootstrap role. See migration 0017 (G-36).';

COMMIT;
