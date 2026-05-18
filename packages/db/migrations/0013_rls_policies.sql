-- Migration 0013: row-level security.
-- Per Architectural Principle P1: every tenant-data table enforces RLS.
-- The app sets `app.tenant_id` at the start of each request transaction.
-- Bypass is only possible by an explicit superuser BYPASS RLS, used by migrations and ops scripts.

BEGIN;

-- ====================================================================================
-- The standard policy: tenant_id must match app.tenant_id setting.
-- We use a helper function for readability and to centralise the policy expression.
-- ====================================================================================
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

COMMENT ON FUNCTION current_tenant_id IS
    'Returns the tenant_id set on the current session/transaction by the app. NULL if unset.';

-- ====================================================================================
-- Enable RLS and apply tenant_isolation policy on every tenant-data table.
-- ====================================================================================
DO $$
DECLARE
    t TEXT;
    tenant_tables TEXT[] := ARRAY[
        'roles',
        'users',
        'user_roles',
        'tenant_sso_configs',
        'refresh_tokens',
        'properties',
        'user_properties',
        'integrations',
        'guests',
        'stays',
        'evidence',
        'card_captures',
        'voice_memos',
        'fb_tickets',
        'preferences',
        'preference_evidence',
        'issues',
        'fb_records',
        'briefs',
        'brief_items',
        'housekeeping_prep',
        'exception_queue_items',
        'identity_merge_candidates',
        'reviews'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I
             USING (tenant_id = current_tenant_id())
             WITH CHECK (tenant_id = current_tenant_id())',
            t
        );
    END LOOP;
END;
$$;

-- ====================================================================================
-- audit_events: special policy.
-- Tenant rows may be read by users of that tenant. INSERT permitted from any session
-- with app.tenant_id set (the trigger validates the tenant_id matches).
-- The append-only triggers in 0011 prevent UPDATE/DELETE regardless of RLS.
-- ====================================================================================
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_isolation ON audit_events
    USING (tenant_id = current_tenant_id())
    WITH CHECK (tenant_id = current_tenant_id());

-- ====================================================================================
-- System-level tables — NOT RLS protected, accessed only via platform-admin role:
-- - tenants (platform admin)
-- - prompt_templates, prompt_versions (global config)
-- - ai_call_logs (cross-tenant ops view; per-tenant queries filter by tenant_id explicitly)
-- ====================================================================================

COMMIT;
