-- Migration 0010: reviews.

BEGIN;

-- ====================================================================================
-- reviews — Ingested from TripAdvisor, Booking.com, Google Business.
-- ====================================================================================
CREATE TABLE reviews (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id             UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    integration_id          UUID NOT NULL REFERENCES integrations(id) ON DELETE RESTRICT,
    source                  review_source NOT NULL,
    external_id             TEXT NOT NULL,
    reviewer_name           TEXT NULL,
    reviewer_country_code   CHAR(2) NULL,
    rating                  NUMERIC(3,1) NULL,
    title                   TEXT NULL,
    body                    TEXT NOT NULL,
    language                CHAR(2) NULL,
    posted_at               TIMESTAMPTZ NOT NULL,
    sentiment               NUMERIC(4,3) NULL,
    topics                  TEXT[] NOT NULL DEFAULT '{}',
    named_staff             TEXT[] NOT NULL DEFAULT '{}',
    linked_guest_id         UUID NULL REFERENCES guests(id) ON DELETE SET NULL,
    link_confidence         NUMERIC(4,3) NULL,
    link_status             review_link_status NOT NULL DEFAULT 'unlinked',
    linked_at               TIMESTAMPTZ NULL,
    linked_by               UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    raw_payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reviews_sentiment_range CHECK (
        sentiment IS NULL OR (sentiment >= -1 AND sentiment <= 1)
    ),
    CONSTRAINT reviews_link_confidence_range CHECK (
        link_confidence IS NULL OR (link_confidence >= 0 AND link_confidence <= 1)
    )
);

CREATE UNIQUE INDEX reviews_tenant_source_external_uniq
    ON reviews (tenant_id, source, external_id);
CREATE INDEX reviews_property_posted_idx ON reviews (property_id, posted_at DESC);
CREATE INDEX reviews_linked_guest_idx ON reviews (linked_guest_id)
    WHERE linked_guest_id IS NOT NULL;
CREATE INDEX reviews_unlinked_idx ON reviews (tenant_id, posted_at DESC)
    WHERE link_status = 'unlinked';
CREATE INDEX reviews_topics_idx ON reviews USING gin (topics);
CREATE INDEX reviews_named_staff_idx ON reviews USING gin (named_staff);

COMMIT;
