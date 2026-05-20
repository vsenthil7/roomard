-- Migration 0016: housekeeping prep cards (UC-09).
--
-- A prep card is a per-stay artefact the housekeeper consults before arrival.
-- It carries the curated subset of guest preferences and flags relevant to
-- room prep: pillow choice, allergies, anniversary/celebration setup,
-- accessibility needs, do-not-disturb hours.
--
-- Generated D-1 (the day before arrival) by a scheduled job that calls the
-- prep-card service. Idempotent on (property_id, stay_id, prep_date).
--
-- Separate from briefs because the audience and content are different:
--   - Brief: front-desk facing, all arrivals on one day, "say this" suggestions
--   - Prep card: housekeeping facing, one stay per card, room-prep items only

BEGIN;

CREATE TYPE prep_card_status AS ENUM ('pending', 'ready', 'completed', 'skipped');

CREATE TABLE housekeeping_prep_cards (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id             UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    stay_id                 UUID NOT NULL REFERENCES stays(id) ON DELETE CASCADE,
    guest_id                UUID NOT NULL REFERENCES guests(id) ON DELETE RESTRICT,
    prep_date               DATE NOT NULL,
    room_number             TEXT NULL,
    arrival_at              TIMESTAMPTZ NOT NULL,
    display_name            TEXT NOT NULL,
    -- Curated preference list — text array of "kind: detail" snippets, in
    -- priority order. Examples: ["pillow: 2 firm", "allergy: peanuts",
    -- "celebration: anniversary"]. Capped at 8 items by the service.
    prep_items              TEXT[] NOT NULL DEFAULT '{}',
    -- Attention flags pulled from the guest record. Examples:
    -- ["mobility_assist", "do_not_disturb_before_10"].
    attention_flags         TEXT[] NOT NULL DEFAULT '{}',
    -- Optional AI-generated warm note for the housekeeper. NULLABLE because
    -- the rule-based prep card is the fallback when AI is unavailable.
    warm_note               TEXT NULL,
    status                  prep_card_status NOT NULL DEFAULT 'ready',
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    model_id                TEXT NULL,
    prompt_version          TEXT NULL,
    completed_at            TIMESTAMPTZ NULL,
    completed_by            UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    completion_notes        TEXT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One card per stay per prep_date — re-running the generator updates rather
-- than duplicates.
CREATE UNIQUE INDEX prep_cards_stay_date_uniq
    ON housekeeping_prep_cards (stay_id, prep_date);

CREATE INDEX prep_cards_property_date_idx
    ON housekeeping_prep_cards (property_id, prep_date DESC);
CREATE INDEX prep_cards_status_idx
    ON housekeeping_prep_cards (status, prep_date DESC)
    WHERE status IN ('pending', 'ready');
CREATE INDEX prep_cards_tenant_idx
    ON housekeeping_prep_cards (tenant_id);

COMMENT ON TABLE housekeeping_prep_cards IS
    'UC-09: per-stay artefact for housekeeping room prep. Generated D-1 of arrival.';
COMMENT ON COLUMN housekeeping_prep_cards.prep_items IS
    'Curated "kind: detail" snippets in priority order, capped at 8.';
COMMENT ON COLUMN housekeeping_prep_cards.warm_note IS
    'Optional AI-generated narrative note. NULL if AI was unavailable or unused.';

COMMIT;
