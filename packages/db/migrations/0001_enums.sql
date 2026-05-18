-- Migration 0001: ENUM types.
-- Per Data Model §1: enums are first-class Postgres types, declared in a dedicated migration.
-- Adding a new enum value later requires a separate migration with ALTER TYPE.

BEGIN;

-- Extensions required by the schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ====================================================================================
-- Tenant & access enums
-- ====================================================================================
CREATE TYPE tenant_tier AS ENUM ('property', 'group_starter', 'group', 'enterprise');
CREATE TYPE tenant_status AS ENUM ('provisioning', 'active', 'suspended', 'closed');
CREATE TYPE data_residency AS ENUM ('eu', 'apac', 'dedicated');
CREATE TYPE sso_protocol AS ENUM ('saml', 'oidc');
CREATE TYPE user_status AS ENUM ('invited', 'active', 'disabled');

-- ====================================================================================
-- Property & infrastructure enums
-- ====================================================================================
CREATE TYPE integration_kind AS ENUM (
    'pms',
    'review_tripadvisor',
    'review_booking',
    'review_google',
    'email_m365',
    'email_google'
);
CREATE TYPE integration_status AS ENUM ('pending', 'active', 'error', 'disabled');

-- ====================================================================================
-- Guest, stay, preference enums
-- ====================================================================================
CREATE TYPE stay_status AS ENUM (
    'confirmed',
    'checked_in',
    'checked_out',
    'no_show',
    'cancelled'
);

CREATE TYPE preference_kind AS ENUM (
    'pillow',
    'temperature',
    'dietary',
    'allergy',
    'room_position',
    'room_type',
    'view',
    'bedding',
    'amenity',
    'service',
    'food_dislike',
    'food_like',
    'language',
    'other'
);

CREATE TYPE preference_polarity AS ENUM (
    'likes',
    'dislikes',
    'requires',
    'avoids',
    'noted'
);

CREATE TYPE preference_status AS ENUM ('active', 'superseded', 'rejected');

-- ====================================================================================
-- Evidence enums
-- ====================================================================================
CREATE TYPE evidence_kind AS ENUM (
    'card_capture',
    'voice_memo',
    'fb_ticket',
    'review',
    'email',
    'manual'
);

CREATE TYPE evidence_status AS ENUM ('pending', 'processed', 'failed', 'redacted');

-- ====================================================================================
-- Brief enums
-- ====================================================================================
CREATE TYPE brief_status AS ENUM ('generating', 'ready', 'delivered', 'failed');
CREATE TYPE brief_item_priority AS ENUM ('vip', 'attention', 'standard');

-- ====================================================================================
-- Housekeeping prep enums
-- ====================================================================================
CREATE TYPE prep_status AS ENUM ('pending', 'in_progress', 'complete', 'skipped');

-- ====================================================================================
-- Exception queue enums
-- ====================================================================================
CREATE TYPE exception_kind AS ENUM (
    'low_ocr_confidence',
    'name_ambiguous',
    'pms_sync_mismatch',
    'review_link_ambiguous',
    'duplicate_guest',
    'unparsed_field',
    'other'
);

CREATE TYPE exception_status AS ENUM ('open', 'in_progress', 'resolved', 'dismissed');

-- ====================================================================================
-- Review enums
-- ====================================================================================
CREATE TYPE review_source AS ENUM ('tripadvisor', 'booking_com', 'google', 'manual');
CREATE TYPE review_link_status AS ENUM (
    'unlinked',
    'auto_linked',
    'manually_linked',
    'rejected'
);

-- ====================================================================================
-- Audit enums
-- ====================================================================================
CREATE TYPE audit_actor_kind AS ENUM ('user', 'system', 'integration', 'ai');
CREATE TYPE audit_operation AS ENUM ('create', 'read', 'update', 'delete', 'export', 'login', 'logout', 'denied');
CREATE TYPE data_class AS ENUM ('A', 'B', 'C', 'D');

-- ====================================================================================
-- AI enums
-- ====================================================================================
CREATE TYPE ai_call_status AS ENUM ('ok', 'error', 'rate_limited', 'timeout');

COMMIT;
