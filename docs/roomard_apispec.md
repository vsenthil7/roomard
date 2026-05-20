# Roomard — API Contract Specification v1.0

**REST API specification for MVP endpoints. OpenAPI 3.1-aligned, rendered in readable markdown form. A canonical OpenAPI YAML is generated from this document as the source of truth for code generation.**

| Field | Value |
|---|---|
| Document | Roomard API Contract Specification v1.0 |
| Date | 18 May 2026 |
| Companion to | BRD v2.0, Use Case Catalogue, Use Case Flows, Architecture, Data Model |
| API base URL | `https://api.roomard.com/v1` |
| Specification format | OpenAPI 3.1 (markdown representation here; YAML generated alongside) |
| Audience | Backend engineers, frontend engineers, mobile engineers, integration partners |
| Scope | MVP endpoints (covering UC-01, UC-05, UC-07, UC-08, UC-09, UC-23, UC-24a, UC-25, UC-29 + supporting tenant/auth APIs) |

---

## 0. Document map

| Section | Purpose |
|---|---|
| 1 | API design principles |
| 2 | Authentication and authorisation |
| 3 | Versioning and lifecycle |
| 4 | Request and response conventions |
| 5 | Error model |
| 6 | Pagination, filtering, sorting |
| 7 | Rate limiting |
| 8 | Common resource shapes |
| 9 | Authentication & tenant endpoints |
| 10 | Guest endpoints |
| 11 | Card capture endpoints |
| 12 | Brief endpoints |
| 13 | Housekeeping prep endpoints |
| 14 | Exception queue endpoints |
| 15 | Review endpoints |
| 16 | PMS sync endpoints (internal + status) |
| 17 | Webhooks (inbound and outbound) |
| 18 | Health and observability endpoints |
| 19 | Open API questions |

---

## 1. API design principles

| # | Principle | Why |
|---|---|---|
| API1 | **REST with resource nouns.** Endpoints are `/guests`, `/briefs`, not `/getGuest`. | Predictability; HTTP semantics carry meaning. |
| API2 | **JSON-only over HTTPS.** No XML, no form-encoded payloads except OAuth callbacks. | One serialisation reduces ambiguity. |
| API3 | **ISO 8601 timestamps in UTC.** Never client-local. | Cross-timezone correctness. |
| API4 | **IDs are UUIDs.** Never auto-increment integers exposed in API. | Tenant-isolation safety; no information leakage. |
| API5 | **Idempotency on writes.** `Idempotency-Key` header on POST/PATCH where the operation creates/mutates. | At-least-once delivery; safe retries. |
| API6 | **Response envelopes only where they earn keep.** Single-resource responses are unwrapped. Collections use `{ items, page }`. | Predictable shape; minimal overhead. |
| API7 | **No breaking changes within a major version.** Additive changes only. | Client trust. |
| API8 | **Errors are typed, not just status-coded.** Every error has a stable `code` string. | Frontends branch on codes, not English. |
| API9 | **Cursors over offsets for pagination.** Stable across inserts. | Correctness at scale. |
| API10 | **Sparse fieldsets supported.** `?fields=id,name,preferences` reduces payload. | Mobile bandwidth, performance. |

---

## 2. Authentication and authorisation

### 2.1 Authentication

Every API request (except `/health` and `/auth/*`) requires a valid bearer token:

```
Authorization: Bearer <jwt>
```

The JWT is issued by AuthSvc after successful SSO or password authentication. Token claims:

```json
{
  "iss": "https://api.roomard.com",
  "sub": "user:01HZ...UUID",
  "tenant_id": "01HZ...UUID",
  "roles": ["front_desk_manager"],
  "properties": ["01HZ...UUID", "01HZ...UUID"],
  "data_classes": ["A", "B", "C"],
  "iat": 1747500000,
  "exp": 1747503600,
  "jti": "01HZ...UUID"
}
```

- **Lifetime:** 1 hour for access tokens; 24 hours for refresh tokens (rotating).
- **Algorithm:** RS256 (asymmetric); public key published at `/.well-known/jwks.json`.
- **Token introspection:** Optional, at `/auth/introspect` for service-to-service verification.

### 2.2 Tenant context

Tenant is derived from the JWT `tenant_id` claim. Clients **never** pass `tenant_id` in query or body. Cross-tenant access is structurally impossible by API design.

### 2.3 MFA-protected endpoints

The following endpoints require a fresh MFA assertion (within 5 minutes):
- `DELETE /guests/{id}` (RTBF purge)
- `POST /compliance/audit-pack/export`
- `POST /tenant/sso/config`
- `POST /tenant/roles` (role definition changes)

MFA assertion is presented via `X-MFA-Assertion: <signed-assertion>` header. Absence on these endpoints returns `403 mfa_required`.

### 2.4 API keys (V2 only — not in MVP)

API keys for programmatic access (integrations, internal tools) deferred to V2. MVP uses OAuth-style JWTs only.

---

## 3. Versioning and lifecycle

### 3.1 URL versioning

- Major version in the URL path: `/v1`
- Breaking changes increment the path: `/v2`
- Both versions run concurrently for at least 12 months on major-version cutover

### 3.2 Lifecycle stages

| Stage | Header | Meaning |
|---|---|---|
| **GA** | (no header) | Generally available, stable |
| **Beta** | `Roomard-Stability: beta` | Functional but subject to non-breaking changes |
| **Deprecated** | `Roomard-Deprecation: <date>` | Will be removed by date |

Deprecated endpoints return `Deprecation` and `Sunset` headers per RFC 8594.

### 3.3 Additive changes that are not breaking

- Adding new endpoints
- Adding optional request fields
- Adding new response fields
- Adding new enum values where clients are documented to accept unknown values gracefully

---

## 4. Request and response conventions

### 4.1 Required headers

| Header | When | Value |
|---|---|---|
| `Authorization` | Always (except health/auth) | `Bearer <jwt>` |
| `Content-Type` | On request body | `application/json` |
| `Accept` | Optional | `application/json` |
| `Idempotency-Key` | POST/PATCH mutations | Client-generated UUID, retained 24h server-side |
| `X-Request-ID` | Optional but recommended | Client-generated; echoed in response and logs |
| `X-MFA-Assertion` | MFA-protected endpoints | Signed MFA assertion |

### 4.2 Standard response headers

| Header | Value |
|---|---|
| `X-Request-ID` | Echo of inbound or server-generated |
| `X-RateLimit-Limit` | Limit for this endpoint/tenant |
| `X-RateLimit-Remaining` | Remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when window resets |
| `Deprecation` / `Sunset` | On deprecated endpoints |

### 4.3 Naming

- Resource names plural: `/guests`, `/briefs`, `/reviews`
- Sub-resources nested where ownership is exclusive: `/guests/{id}/preferences`
- Field names `snake_case`: `last_seen_at`, `display_name`
- Booleans prefixed `is_` or `has_`: `is_active`, `has_pending_review`

### 4.4 Standard envelopes

**Single resource (unwrapped):**
```json
{
  "id": "01HZ...",
  "display_name": "...",
  "created_at": "2026-05-18T10:00:00Z"
}
```

**Collection (wrapped):**
```json
{
  "items": [ /* resources */ ],
  "page": {
    "size": 50,
    "next_cursor": "eyJh...",
    "has_more": true
  }
}
```

---

## 5. Error model

Every error response carries a consistent shape:

```json
{
  "error": {
    "code": "guest_not_found",
    "message": "No guest exists with the given ID in this tenant.",
    "details": {
      "guest_id": "01HZ..."
    },
    "request_id": "01HZ...",
    "documentation_url": "https://docs.roomard.com/errors/guest_not_found"
  }
}
```

### 5.1 Standard error codes (MVP)

| HTTP | Code | When |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON, missing required field, bad parameter |
| 400 | `validation_failed` | Field-level validation; `details` contains per-field errors |
| 401 | `unauthenticated` | Missing or invalid token |
| 401 | `token_expired` | Token expired; refresh required |
| 403 | `forbidden` | Authenticated but lacks permission |
| 403 | `mfa_required` | MFA assertion missing or stale |
| 404 | `not_found` | Resource does not exist or is invisible to caller |
| 404 | `guest_not_found` | Specific to guest endpoints |
| 409 | `conflict` | Concurrent modification, version mismatch |
| 409 | `duplicate` | Resource with same natural key already exists |
| 410 | `gone` | Resource was deleted via RTBF; tombstone visible to DPO only |
| 413 | `payload_too_large` | Upload exceeds size limit |
| 422 | `unprocessable` | Semantically invalid (e.g., departure before arrival) |
| 423 | `locked` | Resource currently being purged |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal_error` | Unexpected server error; `request_id` allows tracing |
| 502 | `upstream_unavailable` | Downstream (PMS, AI inference) unavailable |
| 503 | `service_unavailable` | Maintenance or capacity |
| 504 | `upstream_timeout` | Downstream timed out |

### 5.2 Field-level validation errors

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed.",
    "details": {
      "fields": {
        "arrival_at": "must be before departure_at",
        "rate_currency": "must be a valid ISO 4217 code"
      }
    },
    "request_id": "01HZ..."
  }
}
```

---

## 6. Pagination, filtering, sorting

### 6.1 Cursor pagination

Collection endpoints support cursor pagination:

```
GET /guests?page_size=50&cursor=eyJoYXNoIjoi...
```

Response:
```json
{
  "items": [...],
  "page": {
    "size": 50,
    "next_cursor": "eyJh...",
    "has_more": true
  }
}
```

- `page_size` defaults to 50, max 200
- `cursor` is opaque to client; never construct it manually
- Cursors stable across new inserts (point-in-time semantics where required)

### 6.2 Filtering

Filters use query parameters. Standard patterns:

| Pattern | Example | Meaning |
|---|---|---|
| Exact match | `?status=active` | status equals "active" |
| Multiple values | `?status=active,paused` | status in ("active","paused") |
| Range | `?created_at__gte=2026-01-01T00:00:00Z` | created_at >= date |
| Range | `?created_at__lt=2026-06-01T00:00:00Z` | created_at < date |
| Search | `?q=patel` | Full-text search on resource-defined fields |

### 6.3 Sorting

```
GET /guests?sort=-last_seen_at,display_name
```

Leading `-` for descending. Allowed sort fields per endpoint are documented.

### 6.4 Sparse fieldsets

```
GET /guests/{id}?fields=id,display_name,preferences
```

Reduces payload. Always returns `id` regardless.

---

## 7. Rate limiting

### 7.1 Default limits

| Scope | Limit | Window |
|---|---|---|
| Per user (authenticated) | 600 requests | 1 minute |
| Per tenant (aggregate) | 6,000 requests | 1 minute |
| Per IP (unauthenticated) | 60 requests | 1 minute |
| Specific: card upload | 100 requests | 1 minute per user |
| Specific: AI-heavy endpoints (`/briefs/preview`, `/guests/{id}/narrative`) | 30 requests | 1 minute per user |

### 7.2 Burst handling

Token-bucket algorithm. Bursts of up to 2× the per-minute limit allowed; sustained traffic enforced against the limit.

### 7.3 Rate-limit response

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1747500120
Retry-After: 12

{
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded. Retry after 12 seconds.",
    "details": {
      "retry_after_seconds": 12
    },
    "request_id": "01HZ..."
  }
}
```

### 7.4 Higher limits for Enterprise tier

Enterprise tier tenants receive 5× default limits by default; bespoke limits available on request.

---

## 8. Common resource shapes

These shapes are reused across endpoints. Defined once, referenced by URL fragment elsewhere.

### 8.1 `Money`

```json
{
  "amount": 12500,
  "currency": "GBP",
  "scale": 2
}
```

`amount` in minor units (pence). `scale` for cross-currency consistency.

### 8.2 `Confidence`

```json
{
  "value": 0.92,
  "calibration": "ernie_4.5_v2"
}
```

Confidence is always a 0..1 float with the calibrating prompt-version name attached.

### 8.3 `Address`

```json
{
  "line1": "1 Park Lane",
  "line2": null,
  "city": "London",
  "postal_code": "W1K 1QA",
  "country_code": "GB"
}
```

### 8.4 `AuditableMeta`

Embedded in many resources:

```json
{
  "created_at": "2026-05-18T10:00:00Z",
  "updated_at": "2026-05-18T11:30:00Z",
  "created_by": { "id": "01HZ...", "display_name": "..." },
  "updated_by": { "id": "01HZ...", "display_name": "..." }
}
```

### 8.5 `EvidenceRef`

```json
{
  "id": "01HZ...",
  "kind": "card_capture",
  "occurred_at": "2026-05-18T15:30:00Z",
  "preview": "Mr Patel, room 412, feather pillows, allergic to lilies"
}
```

---

## 9. Authentication & tenant endpoints

### 9.1 `POST /auth/sso/start`

Initiate SSO flow. Returns redirect URL to customer IdP.

**Request:** `{ "tenant_slug": "pestana" }`

**Response 200:**
```json
{ "redirect_url": "https://login.microsoftonline.com/...?...", "state": "01HZ..." }
```

### 9.2 `POST /auth/sso/callback`

IdP callback. Validates SAMLResponse / OIDC code, issues tokens.

**Response 200:**
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "eyJhbGciOi...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### 9.3 `POST /auth/refresh`

Refresh an access token using a refresh token.

**Request:** `{ "refresh_token": "..." }`

**Response 200:** Same shape as 9.2. Refresh token rotates (old token invalidated).

### 9.4 `POST /auth/logout`

Invalidate session.

**Response 204:** Empty.

### 9.5 `GET /auth/me`

Return current user with roles, properties, permissions.

**Response 200:**
```json
{
  "id": "01HZ...",
  "email": "alice@pestana.com",
  "display_name": "Alice Carter",
  "tenant": { "id": "01HZ...", "name": "Pestana Hotels" },
  "roles": [{ "id": "01HZ...", "name": "front_desk_manager", "display_name": "Front Desk Manager" }],
  "properties": [{ "id": "01HZ...", "name": "Pestana London Riverside" }],
  "permissions": {
    "guests": ["read", "write"],
    "preferences": ["read", "write"],
    "briefs": ["read", "annotate"],
    "data_classes": ["A", "B", "C"]
  }
}
```

### 9.6 `GET /tenant`

Return current tenant.

**Response 200:** tenant resource with tier, status, contract dates, data residency.

### 9.7 `POST /tenant/sso/config`

**MFA-required.** Configure SAML or OIDC SSO.

**Request:** SSO config payload (protocol, IdP metadata, attribute mapping, default role).

**Response 201:** Created config.

---

## 10. Guest endpoints

### 10.1 `GET /guests`

List guests. Supports search, filter, sort, pagination.

**Query parameters:**
- `q` — full-text search on name/email
- `arriving_today` — boolean
- `has_open_issue` — boolean
- `attention_flag` — one or more flags
- `sort` — default `-last_seen_at`

**Response 200:** Collection of guest summaries.

### 10.2 `GET /guests/{id}`

Get a guest profile. Used by UC-08.

**Query parameters:**
- `view` — `compact` (default, mobile-friendly) | `full` (web detail)
- `include` — comma-separated: `preferences`, `stays`, `issues`, `reviews`, `evidence`
- `fields` — sparse fields

**Response 200 (compact view):**
```json
{
  "id": "01HZ...",
  "display_name": "Mr Patel",
  "email_lower": "p.patel@example.com",
  "phone_e164": "+447700900000",
  "first_seen_at": "2024-09-12T00:00:00Z",
  "last_seen_at": "2026-04-15T00:00:00Z",
  "attention_flags": [
    { "kind": "vip", "since": "2025-06-01T00:00:00Z" }
  ],
  "priority_preferences": [
    { "kind": "pillow", "polarity": "likes", "detail": "feather, two", "confidence": { "value": 0.95, "calibration": "..." } },
    { "kind": "allergy", "polarity": "avoids", "detail": "lilies in room", "confidence": { "value": 1.0, "calibration": "human_confirmed" } },
    { "kind": "room_position", "polarity": "likes", "detail": "high floor, quiet", "confidence": { "value": 0.82, "calibration": "..." } }
  ],
  "last_stay_summary": "Stayed 12-14 Apr. Praised concierge for theatre booking. No issues.",
  "open_issues": [],
  "say_this": "Welcome back, Mr Patel. We've made sure the room's high and quiet, and there are no lilies — just like last time."
}
```

**Response 200 (full view):** Adds stays, issue history, linked reviews, evidence trail, all preferences with supersession history.

**Response 410 (gone):** If guest was purged via RTBF and caller is DPO viewing tombstone.

### 10.3 `PATCH /guests/{id}`

Update guest profile fields. Used by UC-14 (preference correction is via sub-resource).

**Request:**
```json
{
  "display_name": "Mr P. K. Patel",
  "phone_e164": "+447700900001"
}
```

**Response 200:** Updated guest.

### 10.4 `DELETE /guests/{id}`

**MFA-required.** Initiate RTBF purge. Used by UC-19.

**Request:**
```json
{ "reason": "subject_access_request", "ticket_reference": "DSR-2026-0042" }
```

**Response 202 Accepted:**
```json
{
  "purge_id": "01HZ...",
  "status": "pending",
  "estimated_completion": "2026-05-18T12:00:00Z"
}
```

Purge is asynchronous. Status poll via `/compliance/purges/{purge_id}`.

### 10.5 `GET /guests/{id}/preferences`

List preferences for a guest.

**Query parameters:**
- `active_only` — default `true`; if `false` includes superseded
- `kind` — filter by preference kind

**Response 200:** Collection of preferences.

### 10.6 `POST /guests/{id}/preferences`

Add or supersede a preference.

**Request:**
```json
{
  "kind": "pillow",
  "polarity": "likes",
  "detail": "feather, three",
  "structured": { "material": "feather", "count": 3 },
  "supersedes": "01HZ..." 
}
```

**Response 201:** Created preference.

### 10.7 `GET /guests/{id}/narrative`

Generate or retrieve narrative summary. Used by UC-12.

**Query parameters:**
- `regenerate` — boolean; force regeneration

**Response 200:**
```json
{
  "narrative": "Mr Patel is a returning London-based guest...",
  "generated_at": "2026-05-18T11:45:00Z",
  "evidence_count": 12,
  "prompt_version": "narrative_v1.4.0"
}
```

### 10.8 `POST /guests/{id}/notes`

Add a free-text note or voice memo to a guest profile.

**Request (text):**
```json
{ "kind": "text", "content": "Mentioned anniversary on 15 June." }
```

**Request (voice — multipart):** audio file + JSON metadata part.

**Response 201:** Created note + evidence record.

---

## 11. Card capture endpoints

### 11.1 `POST /captures/cards`

Upload a captured check-in card. Used by UC-01.

**Request (multipart):**
- `image` — JPEG/PNG, max 8MB, max 4096×4096
- `metadata` — JSON part with:
  ```json
  {
    "property_id": "01HZ...",
    "captured_at": "2026-05-18T15:30:00Z",
    "agent_local_id": "client-generated-uuid"
  }
  ```
- `Idempotency-Key` header — UUID; same key returns same response

**Response 202 Accepted:**
```json
{
  "id": "01HZ...",
  "status": "processing",
  "estimated_ready": "2026-05-18T15:30:08Z",
  "poll_url": "/v1/captures/cards/01HZ..."
}
```

**Response 200 (when processing was fast enough to complete inline, opportunistic):**
```json
{
  "id": "01HZ...",
  "status": "completed",
  "ocr_confidence": { "value": 0.93, "calibration": "..." },
  "extracted_fields": {
    "guest_name": "Mr P. Patel",
    "room_number": "412",
    "preferences": [
      { "kind": "pillow", "detail": "feather", "confidence": { "value": 0.91 } }
    ]
  },
  "linked_guest_id": "01HZ...",
  "linked_stay_id": "01HZ...",
  "exception_queue_id": null
}
```

If any extracted field has confidence ≤ 0.85, `exception_queue_id` is populated and the item is added to the queue.

### 11.2 `GET /captures/cards/{id}`

Poll capture status.

**Response 200:** Same shape as 11.1 completed response.

---

## 12. Brief endpoints

### 12.1 `GET /briefs/today`

Get today's brief for a property. Used by UC-07b.

**Query parameters:**
- `property_id` — required if user has multi-property scope
- `role` — optional filter: `concierge` returns concierge-relevant items only
- `view` — `summary` (mobile) | `full` (web with evidence)

**Response 200:**
```json
{
  "id": "01HZ...",
  "property_id": "01HZ...",
  "brief_date": "2026-05-18",
  "generated_at": "2026-05-18T06:15:00Z",
  "is_current": true,
  "summary_text": "34 arrivals today, 8 prioritised. 2 VIPs, 1 complaint-trajectory flag.",
  "sections": {
    "priority": [
      {
        "id": "01HZ...",
        "rank": 1,
        "guest": { "id": "01HZ...", "display_name": "Mr Patel" },
        "stay": { "id": "01HZ...", "arrival_at": "2026-05-18T15:00:00Z", "room_number": "412" },
        "narrative": "Returning VIP — last stay April 2026. Prefers feather pillows, high floor, quiet room...",
        "attention_flags": [{ "kind": "vip" }, { "kind": "anniversary_within_week" }],
        "evidence_count": 7,
        "briefed_at": null
      }
    ],
    "standard": [ /* ... */ ]
  }
}
```

### 12.2 `PATCH /briefs/{brief_id}/items/{item_id}`

Mark a brief item as briefed to team.

**Request:** `{ "briefed": true }`

**Response 200:** Updated item.

### 12.3 `GET /briefs/{brief_id}/items/{item_id}/evidence`

Drill into evidence backing a brief item. Used by web detail view.

**Response 200:** Collection of `EvidenceRef` objects with full per-evidence detail available via further drill-down.

### 12.4 `POST /briefs/regenerate`

Force regeneration of today's brief (used when arrivals change before 11:00 cutoff).

**Request:** `{ "property_id": "01HZ..." }`

**Response 202:** New brief generation queued.

---

## 13. Housekeeping prep endpoints

### 13.1 `GET /prep/tomorrow`

Get tomorrow's prep cards for a property. Used by UC-09.

**Query parameters:**
- `property_id` — required
- `assigned_to` — filter to a specific housekeeper

**Response 200:**
```json
{
  "items": [
    {
      "id": "01HZ...",
      "stay_id": "01HZ...",
      "guest": { "id": "01HZ...", "display_name": "Mr Patel" },
      "room_number": "412",
      "arrival_at": "2026-05-18T15:00:00Z",
      "prep_card": {
        "pillow": "feather, two",
        "temperature": "20°C",
        "extras": ["extra blanket", "no lilies"],
        "accessibility": null
      },
      "assigned_to": null,
      "completed_at": null
    }
  ]
}
```

### 13.2 `POST /prep/assignments`

Assign prep cards to housekeepers.

**Request:**
```json
{
  "assignments": [
    { "prep_id": "01HZ...", "housekeeper_id": "01HZ..." }
  ]
}
```

**Response 200:** Updated assignments.

### 13.3 `PATCH /prep/{id}/complete`

Mark prep complete. Used by housekeeper.

**Request:**
```json
{
  "completion_photo": "base64...optional",
  "completion_note": "optional"
}
```

**Response 200:** Updated prep record.

---

## 14. Exception queue endpoints

### 14.1 `GET /exceptions`

List exception queue items for the user's scope. Used by UC-23.

**Query parameters:**
- `kind` — filter by kind
- `status` — default `pending`
- `priority__gte` — min priority
- `sort` — default `-priority,created_at`

**Response 200:** Collection of exception items.

### 14.2 `GET /exceptions/{id}`

Get a specific exception item with full source data.

**Response 200:**
```json
{
  "id": "01HZ...",
  "kind": "card_low_confidence",
  "source_evidence": { /* EvidenceRef plus full preview */ },
  "ai_suggestion": {
    "extracted_fields": { /* ... */ },
    "confidence_summary": { /* ... */ }
  },
  "priority": 70,
  "status": "pending",
  "created_at": "2026-05-18T15:30:08Z"
}
```

### 14.3 `POST /exceptions/{id}/approve`

Approve AI suggestion as-is.

**Response 200:** Updated item with `status: "approved"`.

### 14.4 `POST /exceptions/{id}/edit`

Approve with edits.

**Request:**
```json
{ "corrected_fields": { /* user-corrected values */ }, "reason": "OCR misread '412' as '4l2'" }
```

**Response 200:** Updated item.

### 14.5 `POST /exceptions/{id}/reject`

Reject the AI suggestion.

**Request:**
```json
{ "reason": "Not a check-in card — this is a room service receipt" }
```

**Response 200:** Updated item.

### 14.6 `POST /exceptions/{id}/defer`

Defer to later review.

**Request:** `{ "defer_until": "2026-05-19T09:00:00Z" }`

**Response 200:** Updated item.

---

## 15. Review endpoints

### 15.1 `GET /reviews`

List reviews for the user's scope. Used by UC-05a/b management surfaces.

**Query parameters:**
- `property_id`, `guest_id`, `link_status`, `posted_at__gte/lt`
- `sort` — default `-posted_at`

**Response 200:** Collection of reviews.

### 15.2 `GET /reviews/{id}`

Get review with sentiment, topics, link suggestions.

**Response 200:**
```json
{
  "id": "01HZ...",
  "external_platform": "tripadvisor",
  "external_review_id": "rev_...",
  "reviewer_name": "P. Patel",
  "rating": 4.0,
  "text": "Stayed for two nights in April. The pillows were just right...",
  "language": "en",
  "posted_at": "2026-04-16T20:00:00Z",
  "sentiment": 0.62,
  "topics": ["pillows", "breakfast", "concierge"],
  "named_staff": [],
  "linked_guest_id": "01HZ...",
  "link_confidence": { "value": 0.94, "calibration": "..." },
  "link_status": "auto_linked"
}
```

### 15.3 `POST /reviews/{id}/link`

Manually link a review to a guest.

**Request:** `{ "guest_id": "01HZ..." }`

**Response 200:** Updated review with `link_status: "manually_linked"`.

### 15.4 `POST /reviews/{id}/unlink`

Unlink. Useful when an auto-link was wrong.

**Response 200:** Updated review.

---

## 16. PMS sync endpoints (status + manual triggers)

### 16.1 `GET /integrations/pms/status`

Sync health for the tenant. Used by Admin status page.

**Response 200:**
```json
{
  "integrations": [
    {
      "id": "01HZ...",
      "property_id": "01HZ...",
      "provider": "mews",
      "status": "active",
      "last_event_at": "2026-05-18T11:58:42Z",
      "events_last_hour": 47,
      "last_reconciliation_at": "2026-05-18T11:00:00Z",
      "last_reconciliation_mismatches": 0,
      "queued_events": 0
    }
  ]
}
```

### 16.2 `POST /integrations/pms/{id}/reconcile`

Manual reconciliation trigger (for ops debugging).

**Response 202:** Reconciliation queued.

---

## 17. Webhooks

### 17.1 Inbound — PMS

PMS providers (Mews flagship) POST webhooks to:

```
POST https://api.roomard.com/v1/webhooks/pms/{integration_id}
```

Authentication via signature header `X-Mews-Signature` (HMAC-SHA256 with shared secret). Body is provider-specific.

**Response 200:** Acknowledged. Roomard then fetches full record via PMS API asynchronously.

### 17.2 Outbound (V2)

Tenants will be able to subscribe to webhooks for events like `guest.preference.added`, `brief.generated`. Deferred to V2.

---

## 18. Health and observability endpoints

### 18.1 `GET /health/live`

Liveness probe (Kubernetes). Returns 200 if process is up.

**Response 200:** `{ "status": "live" }`

### 18.2 `GET /health/ready`

Readiness probe. Returns 200 only if process can serve traffic (DB reachable, cache reachable).

**Response 200:** `{ "status": "ready", "checks": [...] }`

**Response 503:** Not ready.

### 18.3 `GET /metrics`

Prometheus-format metrics. Authenticated to scraping role only.

### 18.4 `GET /.well-known/jwks.json`

Public keys for JWT verification.

---

## 19. Open API questions

| ID | Question | Owner | Resolution target |
|---|---|---|---|
| API-01 | gRPC for service-to-service in addition to REST? | Engineering | Sprint 0 |
| API-02 | GraphQL for `/guests/{id}?include=...` heavy variants — worth it for mobile bandwidth? | Engineering | Sprint 6 |
| API-03 | OpenAPI spec generation: hand-authored YAML or generated from code? | Engineering | Sprint 0 |
| API-04 | WebSocket / Server-Sent Events for live brief updates and exception queue? | Engineering | Sprint 8 |
| API-05 | Sparse fieldset depth limit (preventing N+1 explosions on `?fields=preferences.evidence.source`)? | Engineering | Sprint 2 |
| API-06 | Hard PII fields in API responses — gate by `data_classes` permission or omit entirely? | Engineering + Security | Sprint 1 |
| API-07 | Multi-property scope: per-request `property_id` or session-bound? | Engineering + UX | Sprint 1 |
| API-08 | Rate limits per-endpoint-class vs. global per-user — finer granularity needed? | Engineering | Sprint 3 |

---

## 20. What this document does *not* cover

| Topic | Deferred to |
|---|---|
| Traceability matrix linking endpoints to UCs and stories | Traceability Matrix (Document 8) |
| Test strategy for API endpoints | Test Strategy (Document 9) |
| Endpoints for non-MVP UCs (UC-02, UC-04, UC-06, UC-10, UC-11, UC-15, UC-16, UC-17, UC-18, UC-20, UC-21, UC-22, UC-26) | Future API spec revisions |
| OpenAPI YAML file itself | Generated alongside this markdown |
| SDK code generation | Out of scope; clients generated from OpenAPI |

---

## 21. Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 18 May 2026 | Senthil with Claude | Initial spec covering MVP endpoints; 8 open questions |

---

*End of Roomard API Contract Specification v1.0 — 18 May 2026.*
