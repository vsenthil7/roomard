-- Migration 0014: audit triggers and updated_at maintenance.
-- Per Architectural Principle P3 (audit-first): every write to Class A/B data emits an audit row
-- in the same transaction.

BEGIN;

-- ====================================================================================
-- updated_at maintenance — automatically bump updated_at on row modification.
-- ====================================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
    updated_tables TEXT[] := ARRAY[
        'tenants',
        'roles',
        'users',
        'tenant_sso_configs',
        'properties',
        'integrations',
        'guests',
        'stays',
        'evidence',
        'preferences',
        'issues',
        'fb_records',
        'briefs',
        'brief_items',
        'housekeeping_prep',
        'exception_queue_items',
        'reviews',
        'prompt_templates'
    ];
BEGIN
    FOREACH t IN ARRAY updated_tables
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t || '_set_updated', t
        );
    END LOOP;
END;
$$;

-- ====================================================================================
-- Audit trigger: emits an audit_events row for writes on Class A/B tables.
-- The application sets app.user_id, app.actor_kind, app.request_id, app.user_agent,
-- app.ip_inet on the transaction. If unset, falls back to 'system'.
--
-- This is intentionally a thin generic trigger; the application also writes richer
-- audit events directly via AuditSvc for domain operations. Together they form the
-- complete audit record.
-- ====================================================================================
CREATE OR REPLACE FUNCTION emit_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    op audit_operation;
    actor_user_id UUID;
    actor_kind audit_actor_kind;
    req_id UUID;
    ip_addr INET;
    ua TEXT;
    cls data_class;
    tenant UUID;
    res_id UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        op := 'create';
        tenant := (row_to_json(NEW)->>'tenant_id')::uuid;
        res_id := (row_to_json(NEW)->>'id')::uuid;
    ELSIF TG_OP = 'UPDATE' THEN
        op := 'update';
        tenant := (row_to_json(NEW)->>'tenant_id')::uuid;
        res_id := (row_to_json(NEW)->>'id')::uuid;
    ELSE
        op := 'delete';
        tenant := (row_to_json(OLD)->>'tenant_id')::uuid;
        res_id := (row_to_json(OLD)->>'id')::uuid;
    END IF;

    actor_user_id := NULLIF(current_setting('app.user_id', true), '')::uuid;
    actor_kind := COALESCE(NULLIF(current_setting('app.actor_kind', true), ''), 'system')::audit_actor_kind;
    req_id := NULLIF(current_setting('app.request_id', true), '')::uuid;
    ip_addr := NULLIF(current_setting('app.ip_inet', true), '')::inet;
    ua := NULLIF(current_setting('app.user_agent', true), '');
    cls := COALESCE(NULLIF(TG_ARGV[1], ''), 'B')::data_class;

    INSERT INTO audit_events (
        tenant_id, actor_kind, actor_id, operation, resource_kind, resource_id,
        data_class, request_id, ip_inet, user_agent, detail, occurred_at
    ) VALUES (
        tenant,
        actor_kind,
        actor_user_id,
        op,
        TG_ARGV[0],
        res_id,
        cls,
        req_id,
        ip_addr,
        ua,
        jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP),
        now()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Class A (HARD PII) tables — every write audited.
CREATE TRIGGER guests_audit
    AFTER INSERT OR UPDATE OR DELETE ON guests
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('guest', 'A');

CREATE TRIGGER preferences_audit
    AFTER INSERT OR UPDATE OR DELETE ON preferences
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('preference', 'B');

CREATE TRIGGER evidence_audit
    AFTER INSERT OR UPDATE OR DELETE ON evidence
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('evidence', 'B');

CREATE TRIGGER issues_audit
    AFTER INSERT OR UPDATE OR DELETE ON issues
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('issue', 'B');

CREATE TRIGGER users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('user', 'A');

CREATE TRIGGER user_roles_audit
    AFTER INSERT OR UPDATE OR DELETE ON user_roles
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('user_role', 'A');

CREATE TRIGGER integrations_audit
    AFTER INSERT OR UPDATE OR DELETE ON integrations
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('integration', 'A');

CREATE TRIGGER briefs_audit
    AFTER INSERT OR UPDATE OR DELETE ON briefs
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('brief', 'B');

CREATE TRIGGER reviews_audit
    AFTER INSERT OR UPDATE OR DELETE ON reviews
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('review', 'B');

CREATE TRIGGER exception_queue_audit
    AFTER INSERT OR UPDATE OR DELETE ON exception_queue_items
    FOR EACH ROW EXECUTE FUNCTION emit_audit_event('exception', 'B');

COMMIT;
