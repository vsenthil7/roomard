# Roomard — User Story Backlog v1.0

**Every story from the Use Case Catalogue in INVEST format, with sprint placement for MVP and V2 trajectory.**

| Field | Value |
|---|---|
| Document | Roomard User Story Backlog v1.0 |
| Date | 18 May 2026 |
| Companion to | Roomard BRD v2.0, Use Case Catalogue v1.0, Use Case Flow Diagrams v1.0 |
| Sprint cadence | 1-week sprints, 3–5 stories per sprint |
| Estimation | Fibonacci story points (1, 2, 3, 5, 8, 13) |
| Total stories | ~110 across 30 use cases |
| MVP scope | Sprints 0–11 (~50 stories) |

---

## 0. How to read this backlog

Every story follows INVEST principles:

- **I**ndependent — can be delivered without waiting on another story in the same sprint
- **N**egotiable — scope can flex; the story captures intent, not implementation
- **V**aluable — delivers something a user can use or a foundation that unblocks user-facing work
- **E**stimable — sized in story points relative to team velocity (team baseline calibrated in Sprint 0)
- **S**mall — fits comfortably in one 1-week sprint (≤ 5 points)
- **T**estable — has explicit acceptance criteria

Story IDs follow the format `US-[UC-ID]-[number]` for traceability back to the Use Case Catalogue. Stories that don't map to a single UC use the prefix `US-FND` (foundational), `US-PLAT` (platform), or `US-OPS` (ops/internal).

The backlog is structured into three views:
- **Section A — Sprint Plan (MVP).** Sprints 0–11 with story allocation
- **Section B — V2 Sprint Plan.** Sprints 12–24 outline
- **Section C — Full Story Index.** Every story by UC, queryable

---

## A. MVP Sprint Plan (Sprints 0–11)

### Sprint 0 — Foundation (week 1)

**Goal:** Working dev/staging environment, CI/CD, multi-tenant scaffold, auth basics. No user-facing functionality yet.

| Story ID | Story | Points | Acceptance pointer |
|---|---|---|---|
| US-FND-1 | As an Engineer, I can spin up a local dev environment with one `make up` command so I can start coding within an hour of joining | 3 | Local services healthcheck green |
| US-FND-2 | As a System, code merged to `main` triggers CI build, test, and deploy to staging within 10 minutes | 5 | Pipeline runs, deploy verified |
| US-FND-3 | As an Engineer, I can deploy to a tenant-isolated staging environment with seed data | 3 | Tenant boundary verified by automated test |
| US-FND-4 | As a System, multi-tenant data isolation is enforced at the row level for every table containing tenant data | 5 | RLS test suite passes |

**Total: 16 points.** Foundation sprint runs slightly heavy; one slip-week buffer is acceptable.

---

### Sprint 1 — Authentication & Permissions (week 2)

**Goal:** Users can log in, roles work, every request is authorised.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-28-1 | As an Admin, I see and manage roles within my tenant | 3 | UC-28 |
| US-28-2 | As a System, I enforce role-based permissions on every API request with ≤ 50ms overhead | 5 | UC-28 |
| US-28-3 | As a System, I log every permission denial with actor, resource, timestamp | 3 | UC-28 |
| US-29-1 | As an IT Admin, I configure SAML SSO for my tenant in under 30 minutes | 5 | UC-29 |

**Total: 16 points.**

---

### Sprint 2 — PMS Inbound Sync (Mews) (week 3)

**Goal:** Mews data flows into Roomard reliably. No user-facing UI yet, but the foundation is there.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-24a-1 | As a System, I receive Mews webhooks for booking/check-in/check-out events and persist them to the tenant store within 30 seconds | 5 | UC-24a |
| US-24a-2 | As a System, I reconcile against Mews hourly to catch any missed webhook events | 3 | UC-24a |
| US-24a-3 | As an Admin, I see PMS sync health on a status page (last event, event rate, queued, failed) | 3 | UC-24a |
| US-29-2 | As a Staff User, I log in via my company SSO and reach the application home | 3 | UC-29 |

**Total: 14 points.**

---

### Sprint 3 — Card Capture Pipeline (week 4)

**Goal:** A front-desk agent can photograph a card on a mobile device and see structured fields back. End-to-end.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-01-1 | As a Front Desk Agent, I can capture a check-in card photo via the mobile PWA camera | 3 | UC-01 |
| US-01-2 | As a Front Desk Agent, I see OCR results within 5 seconds of capture | 5 | UC-01 |
| US-01-3 | As a Front Desk Agent, I see per-field confidence so I know which fields the system was uncertain about | 2 | UC-01 |
| US-PLAT-1 | As an Engineer, the OCR → LLM pipeline is wrapped in a single MeDo-orchestrated service callable from any UC | 3 | Platform |

**Total: 13 points.**

---

### Sprint 4 — Exception Queue (week 5)

**Goal:** Low-confidence card extractions land in a queue and can be human-reviewed before they hit guest profiles. Trust foundation.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-23-1 | As a Concierge, I see the exception queue ordered by age and severity, on web | 3 | UC-23 |
| US-23-2 | As a Concierge, I can approve, edit, or reject each item in one action | 3 | UC-23 |
| US-23-3 | As a System, resolved items flow to the guest profile with audit log entry | 3 | UC-23 |
| US-01-5 | As a System, low-confidence card captures (any field ≤ 0.85) route to the exception queue | 2 | UC-01 |
| US-23-4 | As a System, resolution actions are logged as training signals for future model improvement | 2 | UC-23 |

**Total: 13 points.**

---

### Sprint 5 — Mid-Conversation Guest Lookup (week 6)

**Goal:** A front-desk agent in conversation with a guest can look them up and see priority info within 1.5 seconds.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-08-1 | As an Agent, I can search guests by name, room, or booking ref and see ranked candidates | 3 | UC-08 |
| US-08-2 | As an Agent, I see priority preferences in 3 bullets on the compact profile view | 3 | UC-08 |
| US-08-3 | As an Agent, I see a context-appropriate "say this" suggestion on the compact view | 5 | UC-08 |
| US-08-4 | As an Agent, I can drill from the compact view to the full profile and evidence | 3 | UC-08 |

**Total: 14 points.**

---

### Sprint 6 — Offline Mode for Mobile (week 7)

**Goal:** Mobile works at the desk even when the wifi is patchy. Critical for hotel reality.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-01-4 | As an Agent, I can capture cards offline and have them processed when I'm back online | 3 | UC-01 |
| US-08-5 | As an Agent, guest lookup works offline for today's arrivals using a local cache | 3 | UC-08 |
| US-PLAT-2 | As an Engineer, the mobile PWA caches today's arrivals + last 7 days of guest profiles on login | 5 | Platform |
| US-PLAT-3 | As a System, queued offline actions sync on reconnect with conflict detection | 3 | Platform |

**Total: 14 points.**

---

### Sprint 7 — Review Polling & Ingestion (week 8)

**Goal:** External reviews start flowing in. Foundation for guest-linking next sprint.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-25-1 | As a System, I poll TripAdvisor every 2 hours for new reviews | 3 | UC-25 |
| US-25-2 | As a System, I poll Booking.com every 2 hours for new reviews | 3 | UC-25 |
| US-25-3 | As a System, I poll Google Business every 2 hours for new reviews | 3 | UC-25 |
| US-05a-1 | As an Admin, I can connect TripAdvisor/Booking/Google review feeds | 5 | UC-05a |
| US-05a-2 | As a System, ingested reviews have ERNIE 4.5 sentiment and topic extraction applied | 3 | UC-05a |

**Total: 17 points.** Sprint runs heavy — drop US-05a-2 to Sprint 8 if velocity warrants.

---

### Sprint 8 — Review-to-Guest Linking (week 9)

**Goal:** Reviews automatically attach to the guests they're about. The "wow" moment where a review shows up on a guest profile.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-05a-3 | As a Manager, I see new reviews on a web console with extracted sentiment | 3 | UC-05a |
| US-05b-1 | As a System, I attempt to link each new review to a guest using ERNIE X1 identity matching | 5 | UC-05b |
| US-05b-2 | As a Manager, I can manually link unlinked reviews to a guest from the web console | 3 | UC-05b |
| US-05b-3 | As any user viewing a guest profile, I see linked reviews chronologically with sentiment | 3 | UC-05b |

**Total: 14 points.**

---

### Sprint 9 — Arrival Brief Generation (week 10)

**Goal:** The killer feature begins. By Sprint 10 we ship to a friendly customer.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-07a-1 | As a System, I fetch today's arrivals from PMS at 06:00 local time per property | 3 | UC-07a |
| US-07a-2 | As a System, I prioritise arrivals using guest history, prior issues, anniversaries, and value signals | 5 | UC-07a |
| US-07a-3 | As a System, I generate a 1-paragraph brief per prioritised arrival with source attribution | 5 | UC-07a |
| US-07a-4 | As a System, I regenerate the brief if PMS arrivals change before 11:00 | 3 | UC-07a |

**Total: 16 points.**

---

### Sprint 10 — Arrival Brief Distribution (Web + Mobile) (week 11)

**Goal:** The brief reaches the Front Desk Manager and Concierge on the right surface at the right time.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-07b-1 | As a Front Desk Manager, I receive the brief on mobile push by 06:30 local | 3 | UC-07b |
| US-07b-2 | As a Front Desk Manager, I see the full brief on web with one-tap drilldown to evidence | 5 | UC-07b |
| US-07b-3 | As a Concierge, I receive a brief filtered to my responsibilities | 3 | UC-07b |
| US-07b-4 | As a Manager, I can mark each item as "Briefed to team" and the system tracks this | 2 | UC-07b |

**Total: 13 points.**

---

### Sprint 11 — Housekeeping Prep Cards (week 12)

**Goal:** Housekeeping joins the product. Demonstrates the multi-surface, multi-role story to buyers.

| Story ID | Story | Points | UC |
|---|---|---|---|
| US-09-1 | As a System, I generate housekeeping prep cards at 18:00 the day before arrival per room | 3 | UC-09 |
| US-09-2 | As a Housekeeping Supervisor, I see all prep cards for tomorrow on mobile, with assignment controls | 3 | UC-09 |
| US-09-3 | As a Housekeeper, I see my assigned rooms with prep cards on mobile | 3 | UC-09 |
| US-09-4 | As a Housekeeper, I mark a room as prep complete in ≤ 3 taps, with optional photo | 2 | UC-09 |

**Total: 11 points.**

---

### Sprint 11 hardening + first customer cutover (week 13)

This is not a feature sprint. Use it for:
- Performance tuning (brief generation latency, OCR latency, lookup latency)
- UK English benchmark run on real data (200 cards + 500 reviews + 100 emails)
- Documentation for first customer onboarding
- Customer Success playbook v1
- First-customer pilot start

---

### MVP cumulative story count and velocity assumption

| Sprint | Points planned | Cumulative |
|---|---|---|
| 0 — Foundation | 16 | 16 |
| 1 — Auth & Permissions | 16 | 32 |
| 2 — Mews Inbound | 14 | 46 |
| 3 — Card Capture | 13 | 59 |
| 4 — Exception Queue | 13 | 72 |
| 5 — Guest Lookup | 14 | 86 |
| 6 — Offline | 14 | 100 |
| 7 — Review Polling | 17 | 117 |
| 8 — Review Linking | 14 | 131 |
| 9 — Brief Generation | 16 | 147 |
| 10 — Brief Distribution | 13 | 160 |
| 11 — Housekeeping | 11 | 171 |
| **MVP total** | | **~171 points across 12 weeks** |

Implied team velocity: **~14–15 points/sprint.** Realistic for a 4–5 person team (2 backend, 1 frontend, 1 mobile, 1 part-time AI/ML). If velocity comes in at 10–12, MVP slips to 14 sprints and that's acceptable.

---

## B. V2 Sprint Plan (Sprints 12–24, outline)

Once MVP ships to first customer, V2 priorities are driven by what the first customer asks for. The default order, absent customer signal, is:

### Sprints 12–14 — Compliance bundle (UC-18, UC-19, UC-20, UC-21)

The compliance UCs are non-negotiable before any second UK/EU customer. Even the first pilot customer will want them within the first 90 days.

- **Sprint 12** — Audit log foundation + DPO console (US-21-1, US-21-2, US-21-3)
- **Sprint 13** — Right-to-be-forgotten purge + Subject Access Request (US-18a-1, US-18a-2, US-18a-3, US-19-1, US-19-2, US-19-3)
- **Sprint 14** — Guest privacy panel + audit pack export (US-18b-1 through 3, US-20-1, US-20-2)

### Sprints 15–17 — Ingestion expansion (UC-02, UC-03, UC-04)

- **Sprint 15** — UC-02 paper service tickets
- **Sprint 16** — UC-03a + UC-03b email ingestion and extraction
- **Sprint 17** — UC-04 voice memos

### Sprints 18–20 — Cross-property and analytics (UC-06, UC-15, UC-17)

- **Sprint 18** — UC-06a + UC-06b identity resolution
- **Sprint 19** — UC-15 cross-property journey view
- **Sprint 20** — UC-17 OTA recapture tracking (the buyer's killer report)

### Sprints 21–24 — Polish, scale, depth

- **Sprint 21** — UC-11 complaint trajectory flag
- **Sprint 22** — UC-12 narrative summary + UC-13 D-3 prep
- **Sprint 23** — UC-10 F&B prep + UC-14 preference editing
- **Sprint 24** — UC-23 v2 (training-signal loop), UC-24b outbound sync

This brings the product to roughly 70% of the full catalogue by Sprint 24 (~6 months post-MVP).

---

## C. Full Story Index (by Use Case)

The table below indexes every story from every UC. Stories already placed in a sprint are marked; the rest are V2+ backlog.

### Foundation & Platform

| ID | Story (short) | Points | Sprint | Status |
|---|---|---|---|---|
| US-FND-1 | Local dev environment via `make up` | 3 | 0 | MVP |
| US-FND-2 | CI/CD pipeline to staging | 5 | 0 | MVP |
| US-FND-3 | Tenant-isolated staging with seed data | 3 | 0 | MVP |
| US-FND-4 | Row-level multi-tenant isolation | 5 | 0 | MVP |
| US-PLAT-1 | MeDo-orchestrated OCR→LLM pipeline service | 3 | 3 | MVP |
| US-PLAT-2 | Mobile PWA local cache | 5 | 6 | MVP |
| US-PLAT-3 | Offline queue sync with conflict detection | 3 | 6 | MVP |

### UC-01 — Capture Handwritten Check-In Card

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-01-1 | Capture card via mobile camera | 3 | 3 | MVP |
| US-01-2 | OCR results within 5s | 5 | 3 | MVP |
| US-01-3 | Per-field confidence display | 2 | 3 | MVP |
| US-01-4 | Offline capture | 3 | 6 | MVP |
| US-01-5 | Low-confidence routing to exception queue | 2 | 4 | MVP |

### UC-02 — Paper Service Ticket

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-02-1 | F&B Server can photograph ticket | 3 | 15 | V2 |
| US-02-2 | Sentiment scoring on ticket notes | 2 | 15 | V2 |
| US-02-3 | Supervisor sees negative-sentiment tickets | 2 | 15 | V2 |

### UC-03a — Email Ingestion

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-03a-1 | Admin connects concierge mailbox via OAuth | 5 | 16 | V2 |
| US-03a-2 | Emails ingest within 10 minutes | 3 | 16 | V2 |
| US-03a-3 | Concierge sees ingested threads | 2 | 16 | V2 |

### UC-03b — Email Extraction

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-03b-1 | Preferences extracted from threads | 5 | 16 | V2 |
| US-03b-2 | Concierge can confirm/edit/reject | 3 | 16 | V2 |
| US-03b-3 | Identity resolution links to correct guest | 5 | 16 | V2 |

### UC-04 — Voice Memo (Preference)

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-04-1 | Supervisor records voice memo against guest | 3 | 17 | V2 |
| US-04-2 | Memo transcribed and structured | 5 | 17 | V2 |
| US-04-3 | Supervisor can edit structured note | 2 | 17 | V2 |

### UC-05a — Review Ingestion

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-05a-1 | Admin connects review feeds | 5 | 7 | MVP |
| US-05a-2 | Sentiment + topic extraction | 3 | 7 | MVP |
| US-05a-3 | Manager sees reviews on web console | 3 | 8 | MVP |

### UC-05b — Review Linking

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-05b-1 | System auto-links reviews to guests | 5 | 8 | MVP |
| US-05b-2 | Manager can manually link unlinked reviews | 3 | 8 | MVP |
| US-05b-3 | Linked reviews shown on guest profile | 3 | 8 | MVP |

### UC-06a — Identity Candidate Detection

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-06a-1 | Scan new guest records cross-property | 5 | 18 | V2 |
| US-06a-2 | High-confidence matches auto-merge | 3 | 18 | V2 |
| US-06a-3 | Medium-confidence → human review queue | 2 | 18 | V2 |

### UC-06b — Identity Merge Review

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-06b-1 | Manager sees pending merge candidates | 3 | 18 | V2 |
| US-06b-2 | Manager can merge or keep separate | 3 | 18 | V2 |
| US-06b-3 | Merge preserves audit history | 3 | 18 | V2 |

### UC-07a — Brief Generation

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-07a-1 | Fetch arrivals from PMS at 06:00 | 3 | 9 | MVP |
| US-07a-2 | Prioritise arrivals via ERNIE X1 | 5 | 9 | MVP |
| US-07a-3 | Generate 1-paragraph brief per arrival | 5 | 9 | MVP |
| US-07a-4 | Regenerate if arrivals change before 11:00 | 3 | 9 | MVP |

### UC-07b — Brief Distribution

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-07b-1 | FDM receives brief on mobile by 06:30 | 3 | 10 | MVP |
| US-07b-2 | FDM sees full brief on web with drilldown | 5 | 10 | MVP |
| US-07b-3 | Concierge receives role-filtered brief | 3 | 10 | MVP |
| US-07b-4 | Manager marks items as briefed | 2 | 10 | MVP |

### UC-08 — Guest Lookup

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-08-1 | Agent searches and sees ranked candidates | 3 | 5 | MVP |
| US-08-2 | Priority preferences in 3 bullets | 3 | 5 | MVP |
| US-08-3 | "Say this" suggestion | 5 | 5 | MVP |
| US-08-4 | Drill into full profile + evidence | 3 | 5 | MVP |
| US-08-5 | Offline lookup for today's arrivals | 3 | 6 | MVP |

### UC-09 — Housekeeping Prep Card

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-09-1 | Generate prep cards at 18:00 D-1 | 3 | 11 | MVP |
| US-09-2 | Supervisor sees all cards on mobile | 3 | 11 | MVP |
| US-09-3 | Housekeeper sees assigned rooms with cards | 3 | 11 | MVP |
| US-09-4 | Housekeeper marks complete in 3 taps | 2 | 11 | MVP |

### UC-10 — F&B Service Prep

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-10-1 | F&B Manager sees tonight's diners with dietary | 3 | 23 | V2 |
| US-10-2 | Prior complaint flags visible | 3 | 23 | V2 |
| US-10-3 | F&B Manager adds service-prep notes | 2 | 23 | V2 |

### UC-11 — Complaint Trajectory Flag

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-11-1 | System evaluates complaint trajectory | 5 | 21 | V2 |
| US-11-2 | GM receives flag notification | 3 | 21 | V2 |
| US-11-3 | Trajectory flag visible on profile | 2 | 21 | V2 |

### UC-12 — Narrative Summary

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-12-1 | Any user can generate narrative summary | 3 | 22 | V2 |
| US-12-2 | Summary references source data points | 3 | 22 | V2 |
| US-12-3 | User can regenerate and view history | 2 | 22 | V2 |

### UC-13 — Pre-Arrival D-3 Sweep

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-13-1 | System generates D-3 proactive suggestions | 5 | 22 | V2 |
| US-13-2 | Concierge sees and actions prep queue | 3 | 22 | V2 |
| US-13-3 | Status tracked and reportable | 2 | 22 | V2 |

### UC-14 — Preference Correction

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-14-1 | Concierge can edit any preference | 3 | 23 | V2 |
| US-14-2 | Edits are audit-logged | 2 | 23 | V2 |
| US-14-3 | Admin sees "common corrections" report | 3 | 23 | V2 |

### UC-15 — Cross-Property Journey View

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-15-1 | GM sees cross-property timeline | 5 | 19 | V2 |
| US-15-2 | Trajectory classification shown | 3 | 19 | V2 |
| US-15-3 | Segregation rules enforced | 3 | 19 | V2 |

### UC-16a / UC-16b — Brand-Standard Dashboard

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-16a-1 | GM sees property-level metrics dashboard | 5 | (V3) | V3 |
| US-16a-2 | GM can filter and export | 3 | (V3) | V3 |
| US-16b-1 | GM can drill into any metric | 3 | (V3) | V3 |
| US-16b-2 | Drill-down access audit-logged | 2 | (V3) | V3 |

### UC-17 — OTA Recapture Tracking

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-17-1 | VP sees OTA recapture trend | 5 | 20 | V2 |
| US-17-2 | VP can export board-ready PDF | 3 | 20 | V2 |

### UC-18a / UC-18b — GDPR SAR

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-18a-1 | DPO searches and views all subject data | 5 | 13 | V2 |
| US-18a-2 | DPO generates export pack | 5 | 13 | V2 |
| US-18a-3 | DPO initiates purge with reason | 3 | 13 | V2 |
| US-18b-1 | Guest authenticates to privacy panel | 3 | 14 | V2 |
| US-18b-2 | Guest views own data and sources | 3 | 14 | V2 |
| US-18b-3 | Guest requests correction/purge/export | 3 | 14 | V2 |

### UC-19 — RTBF Purge

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-19-1 | DPO initiates purge with MFA | 3 | 13 | V2 |
| US-19-2 | System purges asynchronously across stores | 5 | 13 | V2 |
| US-19-3 | DPO receives verification report | 3 | 13 | V2 |

### UC-20 — Audit Pack Export

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-20-1 | DPO generates audit pack for range | 5 | 14 | V2 |
| US-20-2 | Auditor can verify cryptographic signature | 3 | 14 | V2 |

### UC-21 — Audit Log Review

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-21-1 | DPO can filter audit log | 3 | 12 | V2 |
| US-21-2 | DPO sees full event detail | 3 | 12 | V2 |
| US-21-3 | Audit log is tamper-evident | 5 | 12 | V2 |

### UC-22 — Witness Voice Note

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-22-1 | Supervisor records witness note | 3 | (V3) | V3 |
| US-22-2 | Severity classified by system | 5 | (V3) | V3 |
| US-22-3 | High-severity routes to compliance | 3 | (V3) | V3 |

### UC-23 — Exception Queue

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-23-1 | Concierge sees queue ordered by age | 3 | 4 | MVP |
| US-23-2 | Concierge approves/edits/rejects | 3 | 4 | MVP |
| US-23-3 | Resolved items update guest profile | 3 | 4 | MVP |
| US-23-4 | Resolutions logged as training signal | 2 | 4 | MVP |

### UC-24a — PMS Inbound

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-24a-1 | Receive Mews webhooks and persist | 5 | 2 | MVP |
| US-24a-2 | Hourly reconciliation | 3 | 2 | MVP |
| US-24a-3 | Admin sees sync health on status page | 3 | 2 | MVP |

### UC-24b — PMS Outbound

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-24b-1 | Sync preference updates back to PMS | 5 | 24 | V2 |

### UC-24c — Conflict Resolution

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-24c-1 | System detects PMS/Roomard conflicts | 3 | (V3) | V3 |
| US-24c-2 | Admin resolves escalated conflicts | 3 | (V3) | V3 |

### UC-25 — Review Polling

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-25-1 | Poll TripAdvisor every 2 hours | 3 | 7 | MVP |
| US-25-2 | Poll Booking.com every 2 hours | 3 | 7 | MVP |
| US-25-3 | Poll Google Business every 2 hours | 3 | 7 | MVP |

### UC-26 — Cohort Analytics

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-26-1 | VP defines cohort | 5 | (V3) | V3 |
| US-26-2 | VP sees cohort analytics | 5 | (V3) | V3 |
| US-26-3 | VP saves and re-runs cohorts | 3 | (V3) | V3 |

### UC-27 — Staff Onboarding

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-27-1 | Admin invites staff with role and properties | 3 | (V2-V3) | V2 |
| US-27-2 | New user activates via email link | 3 | (V2-V3) | V2 |
| US-27-3 | New user sees role-specific onboarding | 3 | (V2-V3) | V2 |

### UC-28 — Role-Based Access

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-28-1 | Admin sees and manages roles | 3 | 1 | MVP |
| US-28-2 | System enforces permissions on every request | 5 | 1 | MVP |
| US-28-3 | System logs permission denials | 3 | 1 | MVP |

### UC-29 — SSO

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-29-1 | IT Admin configures SAML SSO | 5 | 1 | MVP |
| US-29-2 | Staff User logs in via company SSO | 3 | 2 | MVP |
| US-29-3 | IT Admin configures OIDC alternatively | 3 | (V2) | V2 |

### UC-30 — Tenant Provisioning

| ID | Story | Points | Sprint | Status |
|---|---|---|---|---|
| US-30-1 | Ops user creates tenant | 5 | (parallel to Sprint 1) | MVP-Ops |
| US-30-2 | System verifies tenant isolation | 5 | (parallel to Sprint 1) | MVP-Ops |
| US-30-3 | Ops user triggers Customer Success handover | 2 | (V2) | V2 |

---

## D. Story estimation calibration

The point values above are **target estimates** assuming:
- 4–5 person team (2 backend, 1 frontend, 1 mobile, 1 part-time AI/ML)
- 1 point ≈ 0.5 day of focused work (including review, test, deploy)
- 5 points ≈ 2.5 days, the upper limit for a single sprint
- Stories larger than 5 points are split before they enter a sprint

After Sprint 0–2 (calibration sprints), velocity should be re-baselined against actuals. If actual velocity is 11 points/sprint instead of 14, MVP slides from 12 to 15 weeks. This is acceptable. **Do not stretch sprint loading to hit the original plan**; slip the date.

---

## E. What is *not* in this backlog

This backlog covers stories that map to documented use cases. It does not yet cover:

- **Design / brand stories.** UI design tokens, mobile design system, brand voice. These are a parallel design track that needs to start in Sprint 2 latest.
- **Marketing site stories.** roomard.com is a separate product surface with its own backlog.
- **Customer Success / Support stories.** Onboarding playbook, support runbooks, escalation procedures. Owned by the CS function, not engineering, but tracked.
- **DevOps & Reliability stories.** Observability, alerting, runbooks, on-call rotation. These will be added as platform stories starting Sprint 6.
- **Security audit & penetration test stories.** Required pre-Sprint 11 cutover; will be scoped with a third-party.

These will be added as the relevant functions stand up. Trying to capture them all now is premature.

---

## F. Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 18 May 2026 | Senthil with Claude | Initial backlog with MVP sprint plan (Sprints 0–11) and V2 outline (Sprints 12–24) |

---

*End of Roomard User Story Backlog v1.0 — 18 May 2026.*
