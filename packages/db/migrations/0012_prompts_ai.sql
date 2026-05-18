-- Migration 0012: prompt_templates, prompt_versions, ai_call_logs.
-- Per Architecture §4 (AI is a service) and §5 (AI inference architecture).

BEGIN;

-- ====================================================================================
-- prompt_templates — Logical prompt by purpose (e.g. "card_capture_extract").
-- ====================================================================================
CREATE TABLE prompt_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    description     TEXT NULL,
    task            TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX prompt_templates_name_uniq ON prompt_templates (name);

COMMENT ON COLUMN prompt_templates.task IS 'Task kind, e.g. ocr.card, llm.brief, llm.review_link.';

-- ====================================================================================
-- prompt_versions — Immutable versioned prompt content.
-- ====================================================================================
CREATE TABLE prompt_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
    version_label   TEXT NOT NULL,
    model_id        TEXT NOT NULL,
    system_prompt   TEXT NULL,
    user_prompt     TEXT NOT NULL,
    parameters      JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX prompt_versions_template_label_uniq
    ON prompt_versions (template_id, version_label);
CREATE INDEX prompt_versions_active_idx
    ON prompt_versions (template_id) WHERE is_active = true;

-- ====================================================================================
-- ai_call_logs — Every inference call logged for cost, observability, audit.
-- ====================================================================================
CREATE TABLE ai_call_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    prompt_version_id   UUID NULL REFERENCES prompt_versions(id) ON DELETE SET NULL,
    template_name       TEXT NOT NULL,
    model_id            TEXT NOT NULL,
    task                TEXT NOT NULL,
    request_id          UUID NULL,
    status              ai_call_status NOT NULL,
    latency_ms          INTEGER NOT NULL,
    input_tokens        INTEGER NULL,
    output_tokens       INTEGER NULL,
    cost_minor_units    INTEGER NULL,
    cost_currency       CHAR(3) NULL,
    input_hash          BYTEA NULL,
    output_hash         BYTEA NULL,
    error_code          TEXT NULL,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_call_logs_tenant_time_idx ON ai_call_logs (tenant_id, occurred_at DESC);
CREATE INDEX ai_call_logs_status_idx ON ai_call_logs (status, occurred_at DESC);
CREATE INDEX ai_call_logs_template_idx ON ai_call_logs (template_name, occurred_at DESC);
CREATE INDEX ai_call_logs_request_idx ON ai_call_logs (request_id) WHERE request_id IS NOT NULL;

COMMIT;
