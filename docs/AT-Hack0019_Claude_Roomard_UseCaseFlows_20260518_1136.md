# Roomard — Use Case Flow Diagrams v1.0

**Visual swimlane flows for MVP use cases. Mermaid-based, renderable in any markdown viewer that supports Mermaid (GitHub, GitLab, Obsidian, VS Code, Notion, etc.).**

| Field | Value |
|---|---|
| Document | Roomard Use Case Flow Diagrams v1.0 |
| Date | 18 May 2026 |
| Companion to | Roomard BRD v2.0, Use Case Catalogue v1.0 |
| Scope | 8 MVP use cases (UC-01, UC-05a, UC-05b, UC-07a, UC-07b, UC-08, UC-09, UC-23, UC-24a, UC-25, UC-29) |
| Diagram format | Mermaid (sequence + flowchart hybrid) |
| Notation | Five-lane swimlane: User · Client (Web/Mobile) · Backend Services · AI Services · External System |

---

## 0. How to read these diagrams

Each flow uses one of two Mermaid forms:

- **Sequence diagram** — for interactive flows where time order matters and there's back-and-forth between user, system, and AI
- **Flowchart** — for background/scheduled flows where branching logic and decision points matter more than timing

Both forms use consistent lane assignments:

| Lane name | What it is |
|---|---|
| **User** | Human actor (Front Desk Agent, Concierge, GM, etc.) |
| **Client** | Mobile app or web app — the surface the user touches |
| **Backend** | Roomard application services (orchestration, storage, business logic) |
| **AI** | Qianfan MaaS endpoints (PaddleOCR-VL, ERNIE 4.5, ERNIE X1) |
| **External** | PMS (Mews), review platforms (TripAdvisor / Booking / Google), SSO IdP |

Exception flows are shown with `alt` blocks (sequence) or branching diamonds (flowchart). Web-vs-mobile divergence is shown in notes where it matters; mostly the flows are surface-agnostic and the client lane simply represents whichever surface the user is on.

---

## UC-01 — Capture Handwritten Check-In Card

**Surface:** Mobile primary, web fallback. Mobile flow shown; web is identical except for camera invocation (file upload instead of native camera).

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent
    participant Mobile as Mobile App
    participant API as Backend API
    participant OCR as PaddleOCR-VL
    participant LLM as ERNIE 4.5
    participant PMS as Mews (PMS)
    participant Store as Backend Store
    participant Q as Exception Queue (UC-23)

    FDA->>Mobile: Tap "Capture Card"
    Mobile->>FDA: Open camera with overlay guides
    FDA->>Mobile: Photograph card
    Mobile->>Mobile: Local quality check (blur, lighting)
    alt Quality insufficient
        Mobile->>FDA: Prompt retake
    else Quality OK
        Mobile->>API: POST /v1/cards { image, agent_id, timestamp }
        API->>Store: Store image (90-day retention)
        API->>OCR: Extract text + layout
        OCR-->>API: Structured OCR output + per-region confidence
        API->>LLM: Parse OCR output into fields (name, room, prefs, dietary)
        LLM-->>API: Structured fields + per-field confidence
        API->>PMS: Lookup booking by name + arrival date
        alt Booking found
            PMS-->>API: Booking record
            API->>Store: Attach card → guest profile
            alt All field confidence > 0.85
                API->>Store: Auto-save preferences with source attribution
                API->>Mobile: Success { confidence summary }
                Mobile->>FDA: Toast "Card captured ✓"
            else Any field confidence ≤ 0.85
                API->>Q: Route to exception queue
                API->>Mobile: Saved-with-review { queue_item_id }
                Mobile->>FDA: Toast "Card saved, fields flagged for review"
            end
        else No booking found
            API->>Mobile: No-match prompt
            Mobile->>FDA: "No booking found. Link manually or create new?"
            FDA->>Mobile: Link to existing or create new
            Mobile->>API: Confirm link/create
            API->>Store: Save linked
        end
    end

    Note over Mobile,API: Offline path — Mobile queues locally up to 50 cards,<br/>flushes to API on reconnect. Same downstream flow.
```

---

## UC-05a — External Review Ingestion

**Surface:** Background scheduled. No user lane.

```mermaid
flowchart TD
    A[Scheduler<br/>every 2 hours] --> B{For each connected<br/>platform per tenant}
    B --> C1[TripAdvisor API]
    B --> C2[Booking.com API]
    B --> C3[Google Business API]
    C1 --> D[Fetch reviews since<br/>last successful poll]
    C2 --> D
    C3 --> D
    D --> E{New reviews<br/>found?}
    E -- No --> F[Update poll cursor, exit]
    E -- Yes --> G[Store raw review<br/>per tenant store]
    G --> H[ERNIE 4.5: extract<br/>sentiment, topics,<br/>named staff, named services]
    H --> I[Store structured<br/>review record]
    I --> J[Emit event:<br/>review.ingested]
    J --> K[Trigger UC-05b<br/>review-to-guest linking]

    style A fill:#e6f3ff
    style H fill:#fff4e6
    style J fill:#e6ffe6
```

---

## UC-05b — Review-to-Guest Linking

**Surface:** Background event-driven; web surface for manual review queue.

```mermaid
flowchart TD
    A[Event:<br/>review.ingested] --> B[Extract identity signals:<br/>reviewer name, stay date hint,<br/>room references, staff names]
    B --> C[Query PMS stay records<br/>within ±14 days of review date]
    C --> D[ERNIE X1: score candidates<br/>against signals]
    D --> E{Top candidate<br/>confidence}
    E -- > 0.90 --> F[Auto-link to guest profile]
    F --> G[Audit log entry:<br/>auto-link]
    F --> H[Emit event:<br/>review.linked]
    E -- 0.70 – 0.90 --> I[Route to Manager Review Queue]
    I --> J[Manager opens web queue]
    J --> K{Manager action}
    K -- Confirm --> L[Link + audit log]
    L --> H
    K -- Reject --> M[Mark as unlinked,<br/>do not re-suggest]
    K -- Defer --> N[Re-queue for tomorrow]
    E -- < 0.70 --> O[Mark unlinked,<br/>visible in unlinked surface]

    style D fill:#fff4e6
    style F fill:#e6ffe6
    style I fill:#ffeecc
```

---

## UC-07a — Daily Arrival Brief Generation

**Surface:** Background scheduled. Output consumed by UC-07b.

```mermaid
flowchart TD
    A[Scheduler:<br/>06:00 local time per property] --> B[Fetch today's arrivals<br/>from PMS via UC-24a cache]
    B --> C{Arrivals count}
    C -- 0 --> D[Generate empty-day brief, exit]
    C -- > 0 --> E[For each arrival,<br/>load guest profile]
    E --> F[ERNIE X1: prioritise<br/>signals: VIP, repeat,<br/>prior issues, anniversary,<br/>high-value, complaint trajectory]
    F --> G[Rank arrivals;<br/>top 8 → priority section,<br/>rest → standard section]
    G --> H[For each prioritised arrival]
    H --> I[ERNIE 4.5: compose<br/>1-paragraph brief<br/>with source attribution]
    I --> J[Assemble 1-page brief document]
    J --> K[Store brief with<br/>generated_at timestamp]
    K --> L[Emit event:<br/>brief.generated]
    L --> M[Trigger UC-07b distribution]

    Note1[At 11:00 cutoff, system checks for PMS arrival changes<br/>and regenerates brief if needed]
    A -.-> Note1
    Note1 -.-> B

    style F fill:#fff4e6
    style I fill:#fff4e6
    style L fill:#e6ffe6
```

---

## UC-07b — Daily Arrival Brief Distribution

**Surface:** Web + Mobile, both first-class.

```mermaid
sequenceDiagram
    autonumber
    participant Sched as Scheduler<br/>(post UC-07a)
    participant API as Backend API
    participant Push as Push Service
    participant Email as Email Service
    participant WebApp as Web App
    participant MobileApp as Mobile App
    actor FDM as Front Desk Manager
    actor Conc as Concierge
    participant Store as Backend Store

    Sched->>API: brief.generated event
    API->>Push: Send push notification to FDM, Concierge devices
    API->>Email: Send brief summary email (fallback channel)
    API->>WebApp: Brief available at /briefs/today

    par Mobile path
        Push-->>MobileApp: Notification "Today's brief ready"
        FDM->>MobileApp: Tap notification
        MobileApp->>API: GET /v1/briefs/today
        API->>Store: Fetch brief
        Store-->>API: Brief data
        API-->>MobileApp: Brief JSON (mobile-shaped)
        MobileApp->>FDM: Show priority section first,<br/>tap to expand each item
        FDM->>MobileApp: Tap "Mark Briefed to team"
        MobileApp->>API: PATCH /v1/briefs/today/item/{id} { briefed: true }
        API->>Store: Update status
    and Web path
        FDM->>WebApp: Open https://app.roomard.com/briefs/today
        WebApp->>API: GET /v1/briefs/today?detail=full
        API->>Store: Fetch brief
        Store-->>API: Brief data
        API-->>WebApp: Brief JSON (full detail)
        WebApp->>FDM: Show full brief with drill-down
        FDM->>WebApp: Tap "View evidence" on item
        WebApp->>API: GET /v1/guests/{id}/evidence
        API-->>WebApp: Source records (card photo, review, email snippets)
    end

    Conc->>MobileApp: Open brief (filtered to concierge responsibilities)
    MobileApp->>API: GET /v1/briefs/today?role=concierge
    API-->>MobileApp: Brief filtered to concierge items

    Note over MobileApp,WebApp: Both surfaces share the same brief data.<br/>Mobile is summary-first; web is detail-first.<br/>"Briefed to team" status syncs across surfaces.
```

---

## UC-08 — Mid-Conversation Guest Lookup

**Surface:** Mobile primary, web fallback.

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant Mobile as Mobile App
    participant API as Backend API
    participant Cache as Local Cache<br/>(today's arrivals)
    participant LLM as ERNIE 4.5
    participant Reason as ERNIE X1
    participant Store as Backend Store

    Agent->>Mobile: Tap search, type "patel" or scan booking
    alt Online
        Mobile->>API: GET /v1/guests/search?q=patel
        API->>Store: Search by name, room, booking ref
        Store-->>API: Candidates (raw)
        API->>Reason: Rank by relevance<br/>(currently checked-in first,<br/>arriving today next, recent prior)
        Reason-->>API: Ranked candidates
        API-->>Mobile: Top 5 candidates with disambiguating info
    else Offline
        Mobile->>Cache: Search local cache<br/>(today's arrivals + last 7 days)
        Cache-->>Mobile: Candidates
    end

    Mobile->>Agent: Show top 5 with last-stay date, room, key flag
    Agent->>Mobile: Tap chosen guest
    Mobile->>API: GET /v1/guests/{id}/summary

    alt Online: full synthesis
        API->>Store: Load profile + history + evidence refs
        Store-->>API: Full record
        API->>LLM: Synthesise priority preferences (3 bullets) +<br/>last-stay summary (1 sentence) +<br/>"say this" suggestion (1 sentence)
        LLM-->>API: Synthesis
        API-->>Mobile: Compact profile view
    else Offline
        Mobile->>Cache: Pre-synthesised compact profile (if cached)
        Cache-->>Mobile: Compact view (last synced state)
    end

    Mobile->>Agent: Show priority preferences, last-stay, say-this
    Agent->>Mobile: (optional) Drill into full profile
    Mobile->>API: GET /v1/guests/{id}/full
    API->>Store: Load full record + evidence
    Store-->>API: Full record + evidence URIs
    API-->>Mobile: Full profile
    Mobile->>Agent: Full profile with evidence trail

    Agent->>Mobile: (optional) Capture new note (voice or text)
    Mobile->>API: POST /v1/guests/{id}/notes
    API->>Store: Save note with agent_id, timestamp
    API->>Store: Audit log: lookup by agent

    Note over Mobile,API: Lookup target latency: ≤ 1.5 seconds on 4G.<br/>Cached lookups: < 200ms.
```

---

## UC-09 — Generate Housekeeping Room Prep Card

**Surface:** Mobile (housekeeping side) + Web (supervisor side).

```mermaid
sequenceDiagram
    autonumber
    participant Sched as Scheduler<br/>18:00 D-1
    participant API as Backend API
    participant PMS as Mews
    participant Store as Backend Store
    participant LLM as ERNIE 4.5
    participant Push as Push Service
    participant SupMobile as Supervisor Mobile
    participant HkMobile as Housekeeper Mobile
    actor Sup as Housekeeping Supervisor
    actor Hk as Housekeeper

    Sched->>API: Trigger prep-card generation
    API->>PMS: Fetch tomorrow's arrivals
    PMS-->>API: Arrival list
    API->>Store: Load guest profiles per arrival
    Store-->>API: Profiles
    loop For each arrival
        API->>LLM: Summarise preferences relevant to room prep<br/>(pillow, temperature, allergies,<br/>special items, accessibility)
        LLM-->>API: Structured prep card
        API->>Store: Save prep card per room
    end
    API->>Push: Notify Supervisor

    Push-->>SupMobile: "Prep cards ready for tomorrow"
    Sup->>SupMobile: Open prep dashboard
    SupMobile->>API: GET /v1/prep/tomorrow
    API-->>SupMobile: All cards + assignment status
    Sup->>SupMobile: Assign rooms to housekeepers
    SupMobile->>API: POST /v1/prep/assignments
    API->>Store: Save assignments
    API->>Push: Notify each housekeeper

    Push-->>HkMobile: "Your rooms for tomorrow"
    Hk->>HkMobile: Open assignments
    HkMobile->>API: GET /v1/prep/my-assignments
    API-->>HkMobile: Assigned rooms with prep cards
    Hk->>HkMobile: Tap room → see prep card<br/>(pillow, temperature, etc.)
    Hk->>HkMobile: Tap "Prep complete" (with optional photo)
    HkMobile->>API: PATCH /v1/prep/{room}/complete
    API->>Store: Update status, log photo if present
    API->>SupMobile: Real-time push: status update
    SupMobile->>Sup: Status update visible on dashboard

    Note over API,Store: Late-booking path: any new arrival after 18:00<br/>generates prep card within 15 minutes
```

---

## UC-23 — Confidence-and-Exception Review Queue

**Surface:** Web primary, mobile fallback.

```mermaid
flowchart TD
    A[Event sources:<br/>UC-01 card capture,<br/>UC-03b email extraction,<br/>UC-05b review linking,<br/>UC-06a identity matching] --> B[Queue item created<br/>with source data + AI extraction + confidence]
    B --> C[Stored in exception_queue<br/>per tenant, per role]
    C --> D[User opens queue on web]
    D --> E[Backend: load queue items<br/>ordered by age + severity]
    E --> F[Web displays:<br/>source thumbnail,<br/>AI extraction,<br/>per-field confidence,<br/>suggested correction]
    F --> G{User action per item}
    G -- Approve --> H[Apply to guest profile,<br/>audit log,<br/>training signal logged]
    G -- Edit --> I[User edits fields,<br/>save corrected version,<br/>audit log,<br/>training signal logged]
    G -- Reject --> J[Drop item with optional reason,<br/>audit log,<br/>training signal logged]
    G -- Defer --> K[Re-queue for later,<br/>no action]
    H --> L[Item removed from queue]
    I --> L
    J --> L

    style A fill:#e6f3ff
    style F fill:#fff4e6
    style L fill:#e6ffe6
```

---

## UC-24a — PMS Inbound Sync (Mews flagship)

**Surface:** Background, with admin status surface on web.

```mermaid
sequenceDiagram
    autonumber
    participant Mews as Mews PMS
    participant Webhook as Webhook Receiver
    participant API as Backend API
    participant Recon as Reconciliation Service<br/>(hourly)
    participant Store as Backend Store
    participant Health as Status Page<br/>(web)
    actor Admin as Tenant Admin

    Note over Mews,Webhook: Real-time event stream

    Mews->>Webhook: POST event { booking.created, booking.modified,<br/>check_in, check_out, no_show, cancellation }
    Webhook->>Webhook: Verify signature
    Webhook->>API: Validated event
    API->>Mews: GET full record by booking_id
    Mews-->>API: Full booking + guest record
    API->>Store: Upsert with PMS reference ID
    API->>API: Trigger downstream events<br/>(arrival.new → UC-07a; check_in → UC-01 path)

    Note over Mews,Recon: Reconciliation (catches missed events)

    Recon->>API: Hourly trigger
    API->>Mews: GET arrivals next 7 days
    Mews-->>API: Current snapshot
    API->>Store: Diff vs local cache
    alt Mismatch detected
        API->>Mews: GET full records for mismatched IDs
        Mews-->>API: Records
        API->>Store: Reconcile
        API->>Health: Log reconciliation event
    end

    Admin->>Health: Open sync status page
    Health-->>Admin: Show: last event time,<br/>event rate per hour,<br/>last reconciliation,<br/>queued / failed events
```

---

## UC-25 — TripAdvisor / Booking / Google Review Polling

**Surface:** Background scheduled.

```mermaid
flowchart TD
    A[Scheduler<br/>every 2 hours per platform] --> B{For each connected platform<br/>per tenant}
    B --> C[Load last poll cursor]
    C --> D[Call platform API<br/>since=last_cursor]
    D --> E{API response}
    E -- 200 OK --> F[Iterate new reviews]
    E -- 429 rate limit --> G[Backoff and retry<br/>exponential]
    G --> D
    E -- Other error --> H[Log + alert,<br/>do not advance cursor]
    F --> I[Store raw review in tenant store]
    I --> J[Trigger UC-05a: ingestion + AI extraction]
    F --> K[Advance poll cursor]
    K --> L[Update status: last_success_at]
    L --> M[Visible on Admin status page]
    H --> M

    style A fill:#e6f3ff
    style J fill:#e6ffe6
    style H fill:#ffe6e6
```

---

## UC-29 — SSO Integration (SAML / OIDC)

**Surface:** Web only.

```mermaid
sequenceDiagram
    autonumber
    actor IT as Customer IT Admin
    actor User as Staff User
    participant WebApp as Roomard Web App
    participant API as Backend API
    participant IdP as Customer IdP<br/>(Entra ID / Okta / Google)
    participant Config as Tenant Config Store

    Note over IT,Config: One-time configuration

    IT->>WebApp: Open SSO setup page (Admin)
    WebApp->>IT: Show SAML metadata fields + OIDC client config
    IT->>IT: Get IdP metadata from Entra / Okta / Google
    IT->>WebApp: Paste IdP metadata + assign default role
    WebApp->>API: POST /v1/tenant/sso/config
    API->>Config: Save SSO config (tenant-scoped)
    API-->>WebApp: Roomard ACS URL + entity ID
    WebApp->>IT: Display Roomard ACS URL + entity ID
    IT->>IdP: Register Roomard as relying party
    IT->>WebApp: Trigger test login
    WebApp->>API: SAMLRequest
    API->>IdP: Redirect for auth
    IdP-->>API: SAMLResponse (signed)
    API->>Config: Verify signature, map attributes to user
    Config-->>API: User mapped or to be created
    API-->>WebApp: Authenticated session
    WebApp-->>IT: Test login success

    Note over User,Config: Daily user login

    User->>WebApp: Open app
    WebApp->>API: No session → redirect to /sso/start
    API->>IdP: SAMLRequest (or OIDC authz request)
    IdP->>User: Show IdP login (or SSO-pass-through)
    User->>IdP: Authenticate
    IdP-->>API: SAMLResponse / OIDC ID token
    API->>Config: Verify, map to user, check role
    Config-->>API: Authorised
    API-->>WebApp: Authenticated session
    WebApp-->>User: Application home
```

---

## Cross-cutting flow — Authentication & Permission Check (every request)

This isn't a UC on its own but underpins every UC above. Worth showing once.

```mermaid
flowchart LR
    A[Request from<br/>Web/Mobile] --> B{Session valid?}
    B -- No --> C[401 Unauthorized<br/>or redirect to SSO]
    B -- Yes --> D[Load user + roles + tenant]
    D --> E{Role permits<br/>this action on<br/>this resource?}
    E -- No --> F[403 Forbidden<br/>+ audit log denial]
    E -- Yes --> G{Tenant data<br/>boundary check}
    G -- Wrong tenant --> F
    G -- OK --> H[Proceed to handler]
    H --> I{Sensitive data<br/>(Class A PII)?}
    I -- Yes --> J[Audit log: read/write<br/>with full context]
    I -- No --> K[Continue]
    J --> K
    K --> L[Response]

    style F fill:#ffe6e6
    style J fill:#fff4e6
```

---

## Diagram coverage summary

| UC | Diagram type | Notes |
|---|---|---|
| UC-01 | Sequence | Mobile-primary, includes offline path |
| UC-05a | Flowchart | Background, scheduled |
| UC-05b | Flowchart | Event-driven, branching by confidence |
| UC-07a | Flowchart | Background, scheduled |
| UC-07b | Sequence | Dual surface (web + mobile parallel paths) |
| UC-08 | Sequence | Mobile-primary, online + offline paths |
| UC-09 | Sequence | Multi-actor (Supervisor + Housekeeper) |
| UC-23 | Flowchart | Web UI flow with decision branches |
| UC-24a | Sequence | Background, includes reconciliation |
| UC-25 | Flowchart | Background poll with error handling |
| UC-29 | Sequence | Two-phase: setup and daily login |

**Total MVP diagrams: 11** (8 MVP UCs, with UC-05, UC-07, and UC-24 split into a + b).

---

## What's not yet diagrammed

The 26 remaining (non-MVP) UCs do not yet have flow diagrams. These will be produced in a v2 of this document if/when those UCs enter active sprint planning. Producing all 37 diagrams up front is premature optimisation — UC flows often shift slightly as architectural decisions land.

---

## Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 18 May 2026 | Senthil with Claude | MVP coverage: 11 diagrams across 8 MVP use cases |

---

*End of Roomard Use Case Flow Diagrams v1.0 — 18 May 2026.*
