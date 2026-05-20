-- Down migration for 0017: remove the application role.
-- Revoke all grants then drop. The role owns no objects (migrations run as the
-- privileged role), so DROP ROLE is safe once privileges are revoked.

BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM roomard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE USAGE, SELECT ON SEQUENCES FROM roomard_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM roomard_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM roomard_app;
REVOKE EXECUTE ON FUNCTION current_tenant_id() FROM roomard_app;
REVOKE USAGE ON SCHEMA public FROM roomard_app;

DROP ROLE IF EXISTS roomard_app;

COMMIT;
