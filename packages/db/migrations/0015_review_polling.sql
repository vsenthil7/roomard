-- Migration 0015: review polling support (UC-25).
--
-- Adds:
--   - integrations.last_polled_at — when did we last successfully fetch reviews
--     from this source? Used by the poller to set the "since" window.
--   - direct_feedback_intake — landing table for reviews captured directly
--     by the property (web form, in-room tablet, post-stay email reply).
--     The DirectFeedbackAdapter reads from here.

BEGIN;

ALTER TABLE integrations
    ADD COLUMN last_polled_at TIMESTAMPTZ NULL;

CREATE INDEX integrations_last_polled_idx
    ON integrations (last_polled_at)
    WHERE status = 'active';

-- ====================================================================================
-- direct_feedback_intake — direct guest feedback captured by the property.
-- Distinct from `reviews` because (a) it's not yet "review-shaped" — no
-- external_id, no sentiment, no link decision — and (b) the property owns
-- the raw record, not an external review provider.
-- ====================================================================================
CREATE TABLE direct_feedback_intake (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    author_name     TEXT NULL,
    author_email    TEXT NULL,
    rating          NUMERIC(3,1) NULL,
    body            TEXT NOT NULL,
    source_channel  TEXT NOT NULL,  -- 'web_form', 'in_room_tablet', 'email_reply', 'sms'
    processed_at    TIMESTAMPTZ NULL,
    processed_review_id UUID NULL REFERENCES reviews(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT direct_feedback_rating_range
        CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10))
);

CREATE INDEX direct_feedback_intake_unprocessed_idx
    ON direct_feedback_intake (property_id, submitted_at)
    WHERE processed_at IS NULL;
CREATE INDEX direct_feedback_intake_tenant_idx
    ON direct_feedback_intake (tenant_id);

COMMENT ON COLUMN direct_feedback_intake.source_channel IS
    'How the guest submitted feedback: web_form, in_room_tablet, email_reply, sms.';

COMMIT;
