# Roomard — Use Case Catalogue v1.0

**The granular specification of every use case, sized to 1-week sprints.**

| Field | Value |
|---|---|
| Document | Roomard Use Case Catalogue v1.0 |
| Date | 18 May 2026 |
| Companion to | Roomard BRD v2.0 |
| Sprint cadence | 1-week sprints, 3–5 user stories per sprint |
| Surfaces | Web + Mobile (both mandatory; surface ownership specified per UC) |
| Total use cases | 30 (with 7 split into sub-UCs → 37 sprint-sized units) |
| MVP scope | UC-01, UC-07, UC-08, UC-09, UC-23, UC-24a, UC-25, UC-29 (~10 sprints) |

---

## 0. How to read this catalogue

Every use case follows the same structure:

- **UC ID and title**
- **Primary actor** (the user role driving the UC)
- **Secondary actors** (other roles or systems involved)
- **Surface** (web / mobile / both / background)
- **Sprint size** (1 sprint, 2 sprints, etc.)
- **Preconditions** (what must be true before this UC starts)
- **Main flow** (the happy path, numbered steps)
- **Alternate flows** (named exceptions and their handling)
- **Postconditions** (what must be true after this UC completes)
- **Acceptance criteria** (testable, binary)
- **User stories** (INVEST-format, sized for 1-week sprints)
- **Dependencies** (other UCs that must be built first)
- **AI components used** (PaddleOCR-VL / ERNIE 4.5 / ERNIE X1 / MeDo orchestration)

The story IDs use the format `US-[UC-ID]-[story-number]`. The full story backlog is a separate document (next in sequence).

---

## UC-01 — Capture Handwritten Check-In Card

| Field | Value |
|---|---|
| Primary actor | Front Desk Agent |
| Secondary actors | System (OCR + entity extraction pipeline) |
| Surface | **Mobile primary**, web fallback |
| Sprint size | **1 sprint** |
| AI components | PaddleOCR-VL (layout-aware OCR), ERNIE 4.5 (entity extraction) |
| MVP? | **Yes** |

### Preconditions
- Front Desk Agent is authenticated to mobile app
- Guest has signed a paper check-in card during arrival
- Mobile device has working camera

### Main flow
1. Front Desk Agent taps "Capture Card" on mobile home screen
2. Camera opens with capture guidelines overlay (corner markers, lighting hint)
3. Agent photographs card; image preview shown
4. Agent confirms or retakes
5. System uploads to backend; status shows "Processing..."
6. PaddleOCR-VL extracts text and layout structure (~2 seconds)
7. ERNIE 4.5 parses extracted text into structured fields: guest name, room number, signature presence, preference notes, dietary, special requests
8. System matches to guest profile via PMS booking lookup
9. Confidence score per field shown to agent
10. If confidence > 0.85 on all fields → auto-saved to guest profile, success toast
11. If confidence ≤ 0.85 on any field → routed to UC-23 exception queue with the photo + extracted fields for human review

### Alternate flows
- **A1: Poor photo quality** — system detects blur or insufficient lighting; prompts retake before sending to OCR
- **A2: No matching booking** — guest's name extracted but no PMS booking found for today; agent prompted to manually link or create profile
- **A3: Offline capture** — no network; photo queued locally; processed when network restored; agent shown queue indicator

### Postconditions
- Guest profile updated with extracted preferences and signature on file
- Audit log entry created with photo reference, OCR confidence per field, agent ID, timestamp
- Original photo retained for 90 days then purged (configurable per tenant)

### Acceptance criteria
- AC-01.1: Photo capture-to-saved-profile completes in ≤ 8 seconds at network conditions ≥ 5Mbps
- AC-01.2: OCR confidence ≥ 0.80 on the UK benchmark corpus (200 real cards)
- AC-01.3: Exception queue receives any card with field confidence ≤ 0.85
- AC-01.4: Offline capture stores up to 50 cards locally and syncs on reconnect
- AC-01.5: Audit log entry contains photo URI, OCR JSON, confidence scores, agent ID, timestamp
- AC-01.6: Guest profile shows source = "Handwritten card, [date]" for every preference extracted

### User stories
| Story ID | Story (INVEST format) | Est. (story points) |
|---|---|---|
| US-01-1 | As a Front Desk Agent, I can capture a check-in card photo via the mobile camera so that I do not need to retype handwriting | 3 |
| US-01-2 | As a Front Desk Agent, I see OCR results within 5 seconds of capture so I know whether the system understood the card | 5 |
| US-01-3 | As a Front Desk Agent, I see per-field confidence so I know which fields the system was uncertain about | 2 |
| US-01-4 | As a Front Desk Agent, I can capture cards offline and have them processed when I'm back online | 3 |
| US-01-5 | As a System, low-confidence captures route to the exception queue (UC-23) | 2 |

### Dependencies
- UC-23 (Confidence-and-exception review queue) must exist before low-confidence cards can be routed
- UC-24a (PMS sync) must exist for booking lookup
- For MVP launch, can degrade: if UC-24a is not ready, agent manually selects the booking

---

## UC-02 — Capture Paper Room Service Ticket

| Field | Value |
|---|---|
| Primary actor | F&B Server |
| Secondary actors | System |
| Surface | **Mobile primary**, web fallback |
| Sprint size | **1 sprint** |
| AI components | PaddleOCR-VL, ERNIE 4.5 |
| MVP? | No (V2) |

### Preconditions
- F&B Server is authenticated to mobile app
- A paper room service ticket has been completed (with room number, items, notes)

### Main flow
1. Server taps "Capture Ticket" on mobile
2. Camera opens; photographs ticket
3. OCR extracts: room number, time, items ordered, agent notes (e.g., "guest said eggs were over-cooked")
4. System matches to current occupant of that room via PMS
5. Items and notes attached to guest profile as F&B history
6. Sentiment-bearing notes routed to ERNIE 4.5 for sentiment scoring
7. Negative-sentiment notes flagged for supervisor review

### Alternate flows
- **A1: Room mismatch** — OCR reads room number incorrectly; agent prompted to correct
- **A2: Walk-in or non-staying customer** — F&B ticket for someone not in PMS; saved as orphan record, linked later if matched to guest

### Postconditions
- F&B history added to guest profile
- Sentiment flag set if applicable
- Audit log entry created

### Acceptance criteria
- AC-02.1: Capture-to-saved completes in ≤ 8 seconds
- AC-02.2: Room number extraction accuracy ≥ 0.95 on UK benchmark
- AC-02.3: Sentiment-flagged tickets visible in supervisor queue within 1 minute

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-02-1 | As an F&B Server, I can photograph a ticket and have it logged to the guest's profile | 3 |
| US-02-2 | As a System, sentiment scoring runs on ticket notes | 2 |
| US-02-3 | As a Supervisor, I see negative-sentiment tickets in my queue | 2 |

### Dependencies
- UC-01 patterns (camera capture, OCR pipeline) reused
- UC-23 for exception routing

---

## UC-03 — Ingest Concierge Email Thread

**Split into UC-03a (ingestion) and UC-03b (extraction & linking).**

### UC-03a — Email Thread Ingestion

| Field | Value |
|---|---|
| Primary actor | System (event-driven) |
| Secondary actors | Concierge (email participant) |
| Surface | Background; web for management |
| Sprint size | **1 sprint** |
| AI components | (none — pure ingestion) |
| MVP? | No (V2) |

#### Preconditions
- Concierge email account is connected to Roomard via IMAP / OAuth (Microsoft 365 or Google Workspace)
- Tenant has authorised the connection

#### Main flow
1. Roomard polls or webhooks the concierge mailbox every 5 minutes
2. New messages identified by message-ID; not previously ingested
3. Message header, body, attachments stored to tenant's encrypted store
4. Message linked to thread by subject + reply-to chain
5. Thread record updated

#### Acceptance criteria
- AC-03a.1: New emails appear in Roomard within 10 minutes
- AC-03a.2: No PII leakage to inference layer at this stage
- AC-03a.3: Attachments (e.g., dietary letter from a guest) stored and indexed

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-03a-1 | As an Admin, I can connect a concierge mailbox via OAuth | 5 |
| US-03a-2 | As a System, new emails are ingested within 10 minutes | 3 |
| US-03a-3 | As a Concierge, I see ingested threads in the web app | 2 |

### UC-03b — Email Thread Extraction & Linking

| Field | Value |
|---|---|
| Primary actor | System (event-driven on new thread) |
| Secondary actors | Concierge (review) |
| Surface | Web |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (entity + preference extraction), ERNIE X1 (guest identity resolution) |
| MVP? | No (V2) |

#### Preconditions
- UC-03a complete; thread is in store
- Guest mentioned in thread is identifiable

#### Main flow
1. New thread triggers extraction pipeline
2. ERNIE 4.5 extracts: guest name(s), preferences, dietary requirements, restaurant bookings, special occasions, allergies
3. ERNIE X1 resolves to guest profile (cross-property identity resolution if needed)
4. Extracted preferences attached to guest profile with source = "Concierge email, [date]"
5. Concierge sees the extraction in the review surface; can confirm, edit, or reject

### Acceptance criteria
- AC-03b.1: Preference extraction F1 ≥ 0.85 on a UK concierge email benchmark
- AC-03b.2: Concierge can confirm/edit/reject any extraction
- AC-03b.3: Confirmed preferences appear in guest profile within 2 minutes of extraction
- AC-03b.4: PII data sent to inference layer is minimised (only the relevant text, not full email)

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-03b-1 | As a System, preferences are extracted from new email threads | 5 |
| US-03b-2 | As a Concierge, I can review and approve/edit extracted preferences | 3 |
| US-03b-3 | As a System, identity resolution links preferences to the correct guest | 5 |

### Dependencies
- UC-03a complete
- UC-06 (identity resolution) shares logic

---

## UC-04 — Capture Supervisor Voice Memo as Preference Note

| Field | Value |
|---|---|
| Primary actor | Front Desk Manager / Supervisor |
| Secondary actors | System |
| Surface | **Mobile primary** |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (speech-to-text + structured extraction) |
| MVP? | No (V2) |

### Preconditions
- Supervisor is authenticated; mobile microphone access granted
- Guest profile context is open or referenced by voice

### Main flow
1. Supervisor taps "Voice note" while viewing a guest profile or arrival
2. Records up to 90 seconds of audio
3. System transcribes via ERNIE 4.5 speech endpoint
4. Structured extraction: preference type, polarity, specific detail
5. Note attached to guest profile with source = "Voice memo, [supervisor], [date]"
6. Supervisor sees the structured note; can edit or confirm

### Alternate flows
- **A1: Background noise** — transcription confidence low; supervisor sees the raw transcript and can re-record or edit
- **A2: Multi-guest mention** — supervisor mentions two guests; system asks which guest the note applies to

### Postconditions
- Guest profile updated; audit log entry with audio URI (retained 30 days then auto-deleted)

### Acceptance criteria
- AC-04.1: Transcription word error rate ≤ 12% on UK English benchmark
- AC-04.2: Audio capture-to-saved completes in ≤ 6 seconds for a 30s memo
- AC-04.3: Audio file purged automatically after 30 days

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-04-1 | As a Supervisor, I can record a voice memo against a guest profile | 3 |
| US-04-2 | As a System, the memo is transcribed and structured | 5 |
| US-04-3 | As a Supervisor, I can edit the structured note before it's saved | 2 |

### Dependencies
- None (standalone)

---

## UC-05 — Ingest External Review

**Split into UC-05a (ingestion) and UC-05b (linking).**

### UC-05a — External Review Ingestion

| Field | Value |
|---|---|
| Primary actor | System (scheduled poll) |
| Secondary actors | TripAdvisor / Booking.com / Google APIs |
| Surface | Background |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (sentiment + entity extraction) |
| MVP? | **Yes** |

#### Preconditions
- Tenant has connected at least one review platform via API (TripAdvisor partner API, Booking.com hotel APIs, Google Business)

#### Main flow
1. Scheduler polls each connected platform every 2 hours
2. New reviews fetched by review-ID
3. Review text + metadata (rating, reviewer name, date, language) stored
4. ERNIE 4.5 extracts: sentiment polarity, specific complaint topics, specific praise topics, named staff members, named services
5. Review record stored with extracted structure
6. UC-05b triggered to attempt guest linking

#### Acceptance criteria
- AC-05a.1: New reviews appear in Roomard within 3 hours of publication on source platform
- AC-05a.2: Sentiment accuracy ≥ 0.80 on UK benchmark
- AC-05a.3: Tenant can see all ingested reviews on the web review console

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-05a-1 | As an Admin, I can connect TripAdvisor / Booking / Google review feeds | 5 |
| US-05a-2 | As a System, new reviews ingest every 2 hours | 3 |
| US-05a-3 | As a Manager, I see new reviews on a web console with extracted sentiment | 3 |

### UC-05b — Review-to-Guest Linking

| Field | Value |
|---|---|
| Primary actor | System (event-driven) |
| Secondary actors | Manager (confirms ambiguous links) |
| Surface | Web (review surface) |
| Sprint size | **1 sprint** |
| AI components | ERNIE X1 (identity matching) |
| MVP? | **Yes** |

#### Preconditions
- Review ingested via UC-05a
- PMS stay data is available

#### Main flow
1. System examines review for guest identity signals: reviewer name, stay date range, specific room or staff references
2. ERNIE X1 matches to PMS stay records within ±14 days of review date
3. Confidence-scored candidate match presented
4. If confidence > 0.90 → auto-linked to guest profile
5. If 0.70–0.90 → routed to manager review queue
6. If < 0.70 → review remains unlinked; visible in unlinked-reviews surface

### Acceptance criteria
- AC-05b.1: Identity match precision ≥ 0.90 on a 500-review benchmark
- AC-05b.2: Auto-linked reviews appear in guest profile within 5 minutes
- AC-05b.3: Manager can manually link any unlinked review to a guest

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-05b-1 | As a System, I attempt to link each review to a guest | 5 |
| US-05b-2 | As a Manager, I can manually link unlinked reviews | 3 |
| US-05b-3 | As a Guest profile viewer, I see linked reviews chronologically with sentiment | 3 |

### Dependencies
- UC-05a complete
- UC-06 (cross-property identity logic) shared

---

## UC-06 — Cross-Property Identity Resolution

**Split into UC-06a (candidate detection) and UC-06b (human review).**

### UC-06a — Identity Candidate Detection

| Field | Value |
|---|---|
| Primary actor | System (event-driven on new guest record) |
| Secondary actors | (none) |
| Surface | Background |
| Sprint size | **1 sprint** |
| AI components | ERNIE X1 (entity matching, reasoning) |
| MVP? | No (V2 — but valuable early) |

#### Preconditions
- Group has 2+ properties on Roomard
- A new guest record appears at one property

#### Main flow
1. New guest record triggers identity-match scan
2. ERNIE X1 compares against all existing guest records across the group on: name variants, email, phone, payment method last-4, date of birth (if collected), home postcode
3. Candidate matches scored
4. If confidence > 0.95 → automatically merged with audit log entry
5. If 0.75–0.95 → routed to UC-06b human review queue
6. If < 0.75 → no candidate; new profile remains independent

#### Acceptance criteria
- AC-06a.1: Identity match precision ≥ 0.95 at auto-merge threshold
- AC-06a.2: Identity match recall ≥ 0.80 at human-review threshold
- AC-06a.3: All matches (auto or manual) logged in audit log

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-06a-1 | As a System, I scan new guest records against cross-property records | 5 |
| US-06a-2 | As a System, high-confidence matches auto-merge | 3 |
| US-06a-3 | As a System, medium-confidence matches route to human review | 2 |

### UC-06b — Identity Merge Human Review

| Field | Value |
|---|---|
| Primary actor | Concierge / Front Desk Manager |
| Secondary actors | System |
| Surface | Web |
| Sprint size | **1 sprint** |
| AI components | (display of UC-06a output) |
| MVP? | No (V2) |

#### Main flow
1. User opens identity review queue
2. Each pending candidate shown side-by-side: profile A, profile B, matching signals, AI's confidence
3. User chooses: Merge, Keep Separate, Defer
4. Merge action: profiles combined, audit log entry
5. Keep Separate: marked permanently; AI does not re-suggest

#### Acceptance criteria
- AC-06b.1: User can review and decide on a candidate in ≤ 30 seconds
- AC-06b.2: Merged profiles preserve full audit history of both
- AC-06b.3: "Keep Separate" decisions are honoured permanently

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-06b-1 | As a Manager, I see pending identity merge candidates | 3 |
| US-06b-2 | As a Manager, I can merge or keep separate | 3 |
| US-06b-3 | As a System, merge action preserves audit history | 3 |

### Dependencies
- UC-06a → UC-06b

---

## UC-07 — Generate Daily Arrival Brief

**Split into UC-07a (generation) and UC-07b (distribution).**

### UC-07a — Brief Generation

| Field | Value |
|---|---|
| Primary actor | System (scheduled 6am) |
| Secondary actors | Front Desk Manager (consumes) |
| Surface | Background |
| Sprint size | **1 sprint** |
| AI components | ERNIE X1 (prioritisation), ERNIE 4.5 (narrative generation), MeDo (orchestration) |
| MVP? | **Yes — flagship use case** |

#### Preconditions
- PMS shows today's arrivals
- Guest profiles exist for repeat guests

#### Main flow
1. At 06:00 local time, scheduler triggers brief generation per property
2. System fetches all arrivals for the day from PMS
3. ERNIE X1 prioritises arrivals: VIP, repeat, prior-issue, anniversary, high-value
4. For each prioritised arrival, ERNIE 4.5 composes a 1-paragraph brief: name, arrival time, room, key preferences, prior-issue summary, suggested actions
5. Brief assembled into a 1-page document with priority section + standard section
6. UC-07b triggered for distribution

#### Acceptance criteria
- AC-07a.1: Brief is generated and ready by 06:30 local time for every property
- AC-07a.2: Brief includes every arrival; priority section has at most 8 arrivals; rest are in a standard section
- AC-07a.3: Each brief item shows source attribution (which data sources contributed)
- AC-07a.4: Brief is regenerated if PMS arrivals change before 11:00

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-07a-1 | As a System, I fetch today's arrivals from PMS at 06:00 | 3 |
| US-07a-2 | As a System, I prioritise arrivals using guest history and signals | 5 |
| US-07a-3 | As a System, I generate a 1-paragraph brief per prioritised arrival | 5 |
| US-07a-4 | As a System, I regenerate the brief if arrivals change before 11:00 | 3 |

### UC-07b — Brief Distribution

| Field | Value |
|---|---|
| Primary actor | System (event-driven post-generation) |
| Secondary actors | Front Desk Manager (consumes), Concierge (consumes) |
| Surface | **Web + Mobile (both first-class)** |
| Sprint size | **1 sprint** |
| AI components | (none — display) |
| MVP? | **Yes** |

#### Preconditions
- UC-07a complete; brief generated

#### Main flow
1. System pushes brief notification to the Front Desk Manager and Concierge via mobile push + email + web in-app
2. User opens the brief on web (full view) or mobile (summary view + tap-to-expand each item)
3. User can mark each priority item as "Briefed to team" — tracked for accountability
4. User can drill into any item to see the underlying evidence (which card, which review, which email)
5. User can edit or annotate the brief; annotations save to a daily handover record

### Acceptance criteria
- AC-07b.1: Brief is accessible on web and mobile by 06:30 local time
- AC-07b.2: Each priority item is one-tap drilldown to evidence
- AC-07b.3: "Briefed to team" status persists and is reportable
- AC-07b.4: Push notification reliability ≥ 95% on the FD Manager device

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-07b-1 | As a Front Desk Manager, I receive the brief on mobile at 06:30 | 3 |
| US-07b-2 | As a Front Desk Manager, I see full brief on web with drilldown | 5 |
| US-07b-3 | As a Concierge, I receive the brief filtered to my responsibilities | 3 |
| US-07b-4 | As a Manager, I can mark items as briefed and the system tracks this | 2 |

### Dependencies
- UC-24a (PMS inbound sync) for arrival data
- UC-01, UC-03b, UC-05b (data sources) recommended but not strict; brief degrades gracefully without them

---

## UC-08 — Mid-Conversation Guest Lookup

| Field | Value |
|---|---|
| Primary actor | Front Desk Agent |
| Secondary actors | System |
| Surface | **Mobile primary**, web fallback |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (synthesis), ERNIE X1 (relevance ranking) |
| MVP? | **Yes — flagship use case** |

### Preconditions
- Agent is authenticated
- A guest is in conversation (in person or on call)

### Main flow
1. Agent searches by name, room number, or booking reference
2. System returns top 5 candidates ranked by relevance (currently checked-in first)
3. Agent taps the right one
4. Profile screen displays: priority preferences (3 bullets), last-stay summary (1 sentence), any open issue, "say this" suggestion (1 sentence the agent can use)
5. Agent can drill into full profile, history, evidence
6. Agent can capture a new note via voice or typing from this screen

### Alternate flows
- **A1: Multiple matches** — system shows all candidates with disambiguating info (last stay date, room)
- **A2: No match** — agent prompted to capture as new guest
- **A3: Offline** — last 7 days of arriving guests cached locally on mobile; search works against cache

### Postconditions
- Lookup logged for audit (which agent saw which guest profile)

### Acceptance criteria
- AC-08.1: Lookup-to-display completes in ≤ 1.5 seconds on mobile
- AC-08.2: Top 5 candidate ranking precision: target guest in top 3 ≥ 95% of the time on UK benchmark
- AC-08.3: "Say this" suggestion is appropriate (not generic) ≥ 80% of the time
- AC-08.4: Audit log records every lookup with agent ID, guest ID, timestamp

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-08-1 | As an Agent, I can search by name and see ranked candidates | 3 |
| US-08-2 | As an Agent, I see priority preferences in 3 bullets | 3 |
| US-08-3 | As an Agent, I see a "say this" suggestion | 5 |
| US-08-4 | As an Agent, I can drill into full profile and evidence | 3 |
| US-08-5 | As an Agent, the lookup works offline for today's arrivals | 3 |

### Dependencies
- Guest profile data structure must exist
- UC-24a (PMS sync) for current-room data

---

## UC-09 — Generate Housekeeping Room Prep Card

| Field | Value |
|---|---|
| Primary actor | System (event-driven, D-1 of arrival) |
| Secondary actors | Housekeeping Supervisor, Housekeeper |
| Surface | **Mobile (housekeeping)** + Web (supervisor) |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (preference summarisation), MeDo (orchestration) |
| MVP? | **Yes** |

### Preconditions
- Arrival is confirmed in PMS for tomorrow
- Guest profile has preferences

### Main flow
1. At 18:00 the day before arrival, system generates prep card per arrival
2. Card contains: room number, guest name, arrival time, pillow preference, temperature preference, special items (extra blankets, baby cot, allergy precautions), any room-specific notes from prior stay
3. Card pushed to Housekeeping Supervisor's mobile
4. Supervisor assigns rooms to housekeepers
5. Housekeeper sees their assigned rooms with prep cards
6. Housekeeper marks each room "prep complete" with optional photo of the prepared room
7. Optional photo OCR / image review (deferred to V3)

### Alternate flows
- **A1: No preferences known** — card shows "Standard prep — first stay"
- **A2: Late arrival** — if booking is made after 18:00, card is generated within 15 minutes
- **A3: Cancelled stay** — card auto-removed from housekeeper's list

### Postconditions
- Prep status tracked per room
- Audit log of preparation completion

### Acceptance criteria
- AC-09.1: Prep cards generated by 18:30 the day before arrival
- AC-09.2: Late bookings have a card generated within 15 minutes
- AC-09.3: Housekeeper can mark complete on mobile in ≤ 3 taps
- AC-09.4: Supervisor sees real-time completion status

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-09-1 | As a System, I generate prep cards at 18:00 the day before arrival | 3 |
| US-09-2 | As a Housekeeping Supervisor, I see all prep cards on mobile | 3 |
| US-09-3 | As a Housekeeper, I see my assigned rooms with prep cards | 3 |
| US-09-4 | As a Housekeeper, I mark a room as prep complete | 2 |

### Dependencies
- UC-24a for arrivals
- Guest profile data

---

## UC-10 — F&B Service Prep (Dietary / Prior Complaint Flag)

| Field | Value |
|---|---|
| Primary actor | F&B Manager |
| Secondary actors | System |
| Surface | **Web primary**, mobile fallback |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (filtering, summarisation) |
| MVP? | No (V2) |

### Preconditions
- Restaurant or breakfast service is scheduled
- Reservations or in-house guests are known

### Main flow
1. F&B Manager opens "Tonight's Service" or "Tomorrow's Breakfast" view
2. System shows expected diners with: dietary flags, allergy flags, prior F&B complaint flag (red/amber/green), preferred table, anniversary/celebration flag
3. Manager briefs the kitchen and service team
4. Manager can add a note ("table 8: peanut allergy — confirm with kitchen")

### Acceptance criteria
- AC-10.1: View loads in ≤ 2 seconds for up to 80 diners
- AC-10.2: All dietary/allergy info is sourced and source-attributed
- AC-10.3: Prior complaint flag turns red if a complaint occurred in the last 3 stays

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-10-1 | As an F&B Manager, I see tonight's diners with dietary flags | 3 |
| US-10-2 | As an F&B Manager, I see prior complaint flags | 3 |
| US-10-3 | As an F&B Manager, I can add service-prep notes | 2 |

### Dependencies
- UC-24a for reservation data
- Guest profile dietary info

---

## UC-11 — Complaint Trajectory Flag (3-Issue Rule)

| Field | Value |
|---|---|
| Primary actor | System (event-driven) |
| Secondary actors | Front Desk Manager, GM |
| Surface | Web |
| Sprint size | **1 sprint** |
| AI components | ERNIE X1 (trajectory reasoning) |
| MVP? | No (V2) |

### Preconditions
- Guest has stay history including any complaints, F&B issues, maintenance requests

### Main flow
1. Any new issue logged against a guest triggers trajectory check
2. ERNIE X1 evaluates: 3 distinct issues in the last 3 stays? Issues escalating in severity? Same staff or same room repeatedly?
3. If trajectory flag triggers → red flag on profile, notification to GM
4. Recommended action shown: "Personal call from GM before next arrival"

### Acceptance criteria
- AC-11.1: Flag triggers within 5 minutes of the third issue being logged
- AC-11.2: GM receives notification on web and mobile
- AC-11.3: Flag visible on guest profile for any subsequent staff lookup

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-11-1 | As a System, I evaluate complaint trajectory after each new issue | 5 |
| US-11-2 | As a GM, I receive a flag notification | 3 |
| US-11-3 | As any user looking up the profile, I see the trajectory flag | 2 |

### Dependencies
- Complaint / issue data structure
- UC-23 patterns reused

---

## UC-12 — Generate Per-Guest Narrative Summary

| Field | Value |
|---|---|
| Primary actor | Any authenticated role (Front Desk Manager, Concierge, GM) |
| Secondary actors | System (on-demand) |
| Surface | **Web + Mobile (both)** |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (synthesis) |
| MVP? | No (V2) |

### Preconditions
- Guest profile exists with at least one prior stay

### Main flow
1. User clicks "Generate narrative summary" on a guest profile
2. ERNIE 4.5 synthesises a 3–5 sentence prose summary covering: who they are, what they prefer, what to watch for, last stay highlights
3. Summary displayed and saved with the profile (regeneratable on demand)
4. User can copy to clipboard or share with team

### Acceptance criteria
- AC-12.1: Summary generated in ≤ 4 seconds
- AC-12.2: Summary references at least 3 source data points
- AC-12.3: Summary is regeneratable; previous versions stored

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-12-1 | As any user, I can generate a narrative summary for a guest | 3 |
| US-12-2 | As a System, summaries reference source data points | 3 |
| US-12-3 | As a user, I can regenerate and access prior versions | 2 |

### Dependencies
- Guest profile data structure

---

## UC-13 — Pre-Arrival Proactive Prep (D-3 Sweep)

| Field | Value |
|---|---|
| Primary actor | System (scheduled D-3) |
| Secondary actors | Concierge |
| Surface | Web |
| Sprint size | **1 sprint** |
| AI components | ERNIE X1 (action suggestion) |
| MVP? | No (V2) |

### Preconditions
- Confirmed arrivals exist for 3 days ahead

### Main flow
1. 3 days before each arrival, system reviews the guest profile
2. ERNIE X1 suggests proactive actions: "Book Aqua Shard for Mr Patel — he visited last time and you mentioned the view, anniversary on the 15th"
3. Suggestions appear in Concierge's "Prep Queue" on web
4. Concierge marks each suggestion: Done, Skip, Reschedule

### Acceptance criteria
- AC-13.1: Suggestions appear by 09:00 on D-3
- AC-13.2: Each suggestion has source data attributed
- AC-13.3: Status (Done/Skip/Reschedule) tracked and reportable

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-13-1 | As a System, I generate proactive prep suggestions D-3 | 5 |
| US-13-2 | As a Concierge, I see and action the prep queue | 3 |
| US-13-3 | As a System, status is tracked | 2 |

### Dependencies
- UC-24a (arrivals)

---

## UC-14 — Guest Preference Correction / Merge

| Field | Value |
|---|---|
| Primary actor | Concierge / Front Desk Manager |
| Secondary actors | System (audit) |
| Surface | Web |
| Sprint size | **1 sprint** |
| AI components | (none — UI workflow) |
| MVP? | No (V2) |

### Preconditions
- Guest profile has at least one preference

### Main flow
1. User opens guest profile
2. User can edit any preference: change polarity, change detail, delete, or mark "not this guest"
3. Each edit captured in audit log with reason
4. System learns: same-pattern edits trigger a retraining hint for the extraction model

### Acceptance criteria
- AC-14.1: Edit completes in ≤ 1 second
- AC-14.2: Audit log entry created with user ID, before/after, reason
- AC-14.3: Edited preferences immediately reflected in next brief/lookup

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-14-1 | As a Concierge, I can edit any preference on a guest profile | 3 |
| US-14-2 | As a System, edits are audit-logged | 2 |
| US-14-3 | As an Admin, I see a "common corrections" report | 3 |

### Dependencies
- Guest profile data structure

---

## UC-15 — Cross-Property Guest Journey View

| Field | Value |
|---|---|
| Primary actor | Group GM / Brand Director |
| Secondary actors | System |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (narrative) |
| MVP? | No (V2) |

### Preconditions
- Guest has stays at 2+ properties in the group

### Main flow
1. GM opens a guest profile in cross-property mode
2. Timeline view of all stays across all properties: dates, properties, key events, preferences captured, complaints
3. Trajectory: improving / steady / declining experience
4. Narrative summary at top

### Acceptance criteria
- AC-15.1: Timeline loads in ≤ 3 seconds for guests with up to 50 stays
- AC-15.2: All cross-property data segregation rules respected
- AC-15.3: Trajectory classification is consistent (improving/steady/declining)

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-15-1 | As a GM, I see a cross-property journey timeline | 5 |
| US-15-2 | As a GM, I see trajectory classification | 3 |
| US-15-3 | As a System, segregation rules are enforced | 3 |

### Dependencies
- UC-06 (identity resolution)

---

## UC-16 — Brand-Standard Consistency Dashboard

**Split into UC-16a (metrics) and UC-16b (drill-down).**

### UC-16a — Metrics Dashboard

| Field | Value |
|---|---|
| Primary actor | Group GM / Brand Director |
| Secondary actors | (none) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none — analytics) |
| MVP? | No (V2) |

#### Main flow
1. GM opens dashboard
2. Sees per-property metrics: brief acceptance rate, prep card completion rate, complaint resolution time, repeat-booking rate, OTA recapture estimate
3. Comparative view across properties + group benchmark
4. Filter by property cluster, date range

#### Acceptance criteria
- AC-16a.1: Dashboard loads in ≤ 4 seconds for up to 200 properties
- AC-16a.2: Metrics refresh every 1 hour
- AC-16a.3: Export to CSV/PDF

### UC-16b — Drill-Down

| Field | Value |
|---|---|
| Primary actor | Group GM |
| Secondary actors | (none) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (V2) |

#### Main flow
1. GM clicks a metric on a property
2. Sees the underlying records driving that metric
3. Can drill further into specific guest stays

### Acceptance criteria
- AC-16b.1: Drilldown opens within 2 seconds
- AC-16b.2: Audit log captures the drill-down access

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-16a-1 | As a GM, I see property-level metrics on a dashboard | 5 |
| US-16a-2 | As a GM, I can filter and export | 3 |
| US-16b-1 | As a GM, I can drill into any metric | 3 |
| US-16b-2 | As a System, drill-down access is audit-logged | 2 |

### Dependencies
- Analytics data warehouse

---

## UC-17 — OTA-Commission-Recapture Tracking

| Field | Value |
|---|---|
| Primary actor | VP Guest Experience |
| Secondary actors | (none) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (V2) |

### Preconditions
- Property has OTA-mix baseline data

### Main flow
1. VP opens "OTA Recapture" report
2. Shows: direct-booking rate trend, OTA-booking rate trend, attributed recapture (£ value, conservative estimate)
3. Comparison: pre-Roomard baseline vs current
4. Export for board reports

### Acceptance criteria
- AC-17.1: Report loads in ≤ 3 seconds
- AC-17.2: Recapture calculation methodology is documented and conservative
- AC-17.3: Report exportable to PDF with cover page

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-17-1 | As a VP, I see the OTA recapture trend | 5 |
| US-17-2 | As a VP, I can export a board-ready PDF | 3 |

### Dependencies
- PMS booking-channel data

---

## UC-18 — GDPR Subject Access Request Fulfilment

**Split into UC-18a (DPO surface) and UC-18b (guest panel).**

### UC-18a — DPO Surface

| Field | Value |
|---|---|
| Primary actor | Data Privacy Officer |
| Secondary actors | Guest (via request) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (compliance — required for any UK/EU launch) |

#### Main flow
1. DPO receives a subject access request
2. DPO searches by email/name in DPO console
3. System shows all data held about the subject across all sources
4. DPO can: generate export pack (PDF + JSON), initiate purge, dispute (with reason)
5. SLA tracked: 30 days

#### Acceptance criteria
- AC-18a.1: Search returns all data within 60 seconds
- AC-18a.2: Export pack contains 100% of data with source attribution
- AC-18a.3: Action audit-logged

### UC-18b — Guest Privacy Panel

| Field | Value |
|---|---|
| Primary actor | Guest (external) |
| Secondary actors | DPO |
| Surface | **Web (public-facing, guest panel)** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (compliance — required) |

#### Main flow
1. Guest visits roomard-privacy.[hotel-group].com (or similar)
2. Authenticates via email magic link
3. Views: their data, sources, retention dates
4. Can request: correction, purge, export
5. Request routed to UC-18a DPO surface

#### Acceptance criteria
- AC-18b.1: Guest panel accessible 24/7
- AC-18b.2: Requests appear in DPO queue within 5 minutes
- AC-18b.3: Panel passes accessibility audit (WCAG 2.1 AA)

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-18a-1 | As a DPO, I can search and view all data on a subject | 5 |
| US-18a-2 | As a DPO, I can generate an export pack | 5 |
| US-18a-3 | As a DPO, I can initiate purge with reason | 3 |
| US-18b-1 | As a Guest, I can authenticate to the privacy panel | 3 |
| US-18b-2 | As a Guest, I can view my data and sources | 3 |
| US-18b-3 | As a Guest, I can request correction/purge/export | 3 |

### Dependencies
- UC-19 for purge implementation

---

## UC-19 — Right-to-Be-Forgotten Purge

| Field | Value |
|---|---|
| Primary actor | Data Privacy Officer |
| Secondary actors | System |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (compliance — required) |

### Preconditions
- Verified subject access request for erasure (from UC-18a or direct DPO action)
- No overriding legal hold (e.g., active investigation)

### Main flow
1. DPO initiates purge with confirmation step ("Type DELETE to confirm")
2. System initiates async purge across all data stores: profile, preferences, history, evidence files, audit references
3. Purge tracked with status: pending, in-progress, complete
4. Verification report generated within 30 days
5. Tombstone record retained (cryptographic hash of original ID only) for audit purposes — does not contain PII

### Acceptance criteria
- AC-19.1: Purge initiated within 5 minutes of DPO confirmation
- AC-19.2: Verification report shows 100% data removal across all stores
- AC-19.3: Tombstone record exists and contains no PII
- AC-19.4: Purge action requires MFA confirmation

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-19-1 | As a DPO, I can initiate a purge with MFA confirmation | 3 |
| US-19-2 | As a System, I purge across all data stores asynchronously | 5 |
| US-19-3 | As a DPO, I receive a verification report | 3 |

### Dependencies
- Audit log infrastructure

---

## UC-20 — Audit Pack Export for External Verifier

| Field | Value |
|---|---|
| Primary actor | Data Privacy Officer / External Auditor |
| Secondary actors | System |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No |

### Main flow
1. DPO selects date range and scope (one guest, one property, all)
2. System generates audit pack: all relevant events, AI calls, data accesses, edits, with full chain of evidence
3. Pack is cryptographically signed
4. Downloadable as ZIP with PDF index

### Acceptance criteria
- AC-20.1: Pack generates for a 1-property, 1-month range in ≤ 60 seconds
- AC-20.2: PDF index is human-readable
- AC-20.3: Cryptographic signature is verifiable

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-20-1 | As a DPO, I generate an audit pack for a range | 5 |
| US-20-2 | As an External Auditor, I can verify the cryptographic signature | 3 |

### Dependencies
- UC-21 (audit log)

---

## UC-21 — Audit Log Review

| Field | Value |
|---|---|
| Primary actor | DPO / Compliance |
| Secondary actors | (none) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (compliance — required) |

### Main flow
1. DPO opens audit log
2. Filters: by actor, by guest, by event type, by date range, by AI call vs human action
3. Sees event stream with full detail
4. Can export filtered view

### Acceptance criteria
- AC-21.1: Filter returns results in ≤ 3 seconds for up to 1M events
- AC-21.2: All events include actor, action, target, timestamp, source IP
- AC-21.3: Tamper-evident: any modification breaks signature chain

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-21-1 | As a DPO, I can filter the audit log | 3 |
| US-21-2 | As a DPO, I see full event detail | 3 |
| US-21-3 | As a System, the log is tamper-evident | 5 |

### Dependencies
- Audit log infrastructure (foundational)

---

## UC-22 — Voice Memo to Structured Witness Note

| Field | Value |
|---|---|
| Primary actor | Supervisor |
| Secondary actors | System |
| Surface | **Mobile primary** |
| Sprint size | **1 sprint** |
| AI components | ERNIE 4.5 (speech-to-text + structured extraction) |
| MVP? | No (V2) |

### Notes
This is a superset of UC-04 — covers witness notes related to incidents (a complaint, a safety event, a staff observation) rather than just preference notes. Shares the same pipeline as UC-04 but with incident-specific extraction (severity, parties involved, time, location).

### Main flow
1. Supervisor records voice memo
2. Transcript + structured fields (incident type, severity, parties)
3. Routed to compliance / management review if severity high
4. Linked to guest profile and/or staff record

### Acceptance criteria
- AC-22.1: Transcription quality matches UC-04 standard
- AC-22.2: Severity classification accuracy ≥ 0.80 on UK benchmark
- AC-22.3: High-severity routes to supervisor within 2 minutes

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-22-1 | As a Supervisor, I can record a witness voice note | 3 |
| US-22-2 | As a System, severity is classified | 5 |
| US-22-3 | As a System, high-severity routes to compliance | 3 |

### Dependencies
- UC-04 (shared pipeline)

---

## UC-23 — Confidence-and-Exception Review Queue

| Field | Value |
|---|---|
| Primary actor | Concierge / Front Desk Manager |
| Secondary actors | System |
| Surface | **Web primary**, mobile fallback |
| Sprint size | **1 sprint** |
| AI components | (display of confidence outputs) |
| MVP? | **Yes** |

### Preconditions
- Pipeline has produced low-confidence outputs (from UC-01, UC-03b, UC-05b, etc.)

### Main flow
1. User opens "Exception Queue"
2. Sees items ordered by age (oldest first) and severity
3. Each item shows: source (card photo, email snippet, review), AI's extraction, confidence per field, suggested correction
4. User actions per item: Approve, Edit, Reject, Defer
5. Approved items flow to guest profile
6. Rejected items dropped with optional reason

### Acceptance criteria
- AC-23.1: Queue loads in ≤ 2 seconds for up to 200 pending items
- AC-23.2: Each item resolved in ≤ 30 seconds median
- AC-23.3: Approval/edit/reject is one tap from item view
- AC-23.4: Resolved items become AI training signal (future-state)

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-23-1 | As a Concierge, I see the exception queue ordered by age | 3 |
| US-23-2 | As a Concierge, I can approve/edit/reject items | 3 |
| US-23-3 | As a System, resolved items update the guest profile | 3 |
| US-23-4 | As a System, resolutions become training signal (logged for future) | 2 |

### Dependencies
- UC-01 produces queue items
- Multiple UCs feed it

---

## UC-24 — PMS Bidirectional Sync

**Split into UC-24a (inbound), UC-24b (outbound), and UC-24c (conflict resolution).**

### UC-24a — Inbound PMS Sync

| Field | Value |
|---|---|
| Primary actor | System (continuous) |
| Secondary actors | PMS (Mews flagship; Cloudbeds, Opera Cloud, Apaleo as roadmap) |
| Surface | Background |
| Sprint size | **1 sprint** |
| AI components | (none — data integration) |
| MVP? | **Yes** |

#### Main flow
1. Roomard subscribes to PMS webhooks for: new booking, modified booking, check-in, check-out, no-show, cancellation
2. On event, fetches full record via PMS API
3. Stores in tenant's data store with PMS reference ID
4. Triggers downstream UCs (UC-01 for new check-in, UC-07a for arrival inclusion)

#### Acceptance criteria
- AC-24a.1: Events propagate from PMS to Roomard within 30 seconds
- AC-24a.2: All event types from Mews API supported
- AC-24a.3: Reconciliation: hourly cross-check; mismatches flagged

#### User stories
| Story ID | Story | Points |
|---|---|---|
| US-24a-1 | As a System, I receive Mews webhooks and update Roomard | 5 |
| US-24a-2 | As a System, I reconcile hourly to catch missed events | 3 |
| US-24a-3 | As an Admin, I see sync health on a status page | 3 |

### UC-24b — Outbound PMS Sync

| Field | Value |
|---|---|
| Primary actor | System (event-driven) |
| Secondary actors | PMS |
| Surface | Background |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (V2) |

#### Main flow
1. Preference updates in Roomard (from UC-14, UC-23) flow back to PMS guest notes field
2. Formatted as concise note: "Pillow: feather. Allergy: lilies. Last issue: AC noise, resolved."
3. Avoids overwriting non-Roomard notes

#### Acceptance criteria
- AC-24b.1: Outbound sync within 5 minutes of source update
- AC-24b.2: PMS notes field not overwritten — appended/replaced only in Roomard-managed section

### UC-24c — Conflict Resolution

| Field | Value |
|---|---|
| Primary actor | System + Admin (when manual escalation needed) |
| Secondary actors | (none) |
| Surface | Web |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No |

#### Main flow
1. If PMS and Roomard data conflict (same guest, different details), system detects
2. Default: PMS wins for billing/booking data; Roomard wins for preference data
3. Edge cases (name differs, email differs) escalate to admin queue

#### Acceptance criteria
- AC-24c.1: Conflict detection within 10 minutes
- AC-24c.2: Default rules applied automatically
- AC-24c.3: Escalations resolved within 24 hours

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-24b-1 | As a System, I sync preference updates back to PMS | 5 |
| US-24c-1 | As a System, I detect conflicts | 3 |
| US-24c-2 | As an Admin, I resolve escalated conflicts | 3 |

### Dependencies
- Mews API certification (for Mews-first launch)

---

## UC-25 — TripAdvisor / Booking / Google Review Polling

| Field | Value |
|---|---|
| Primary actor | System (scheduled) |
| Secondary actors | (none — calls external APIs) |
| Surface | Background |
| Sprint size | **1 sprint** |
| AI components | (none in this UC — feeds UC-05a) |
| MVP? | **Yes** |

### Preconditions
- Tenant has connected at least one platform API

### Main flow
1. Scheduler runs every 2 hours per platform
2. Fetches new reviews since last successful poll
3. Stores in raw review store
4. UC-05a (review ingestion) triggered

### Acceptance criteria
- AC-25.1: Poll runs reliably every 2 hours
- AC-25.2: Rate-limit handling: backs off and retries
- AC-25.3: Connection health on status page

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-25-1 | As a System, I poll TripAdvisor every 2 hours | 3 |
| US-25-2 | As a System, I poll Booking.com every 2 hours | 3 |
| US-25-3 | As a System, I poll Google Business every 2 hours | 3 |

### Dependencies
- UC-05a downstream

---

## UC-26 — Multi-Property Cohort Analytics

| Field | Value |
|---|---|
| Primary actor | VP Guest Experience |
| Secondary actors | (none) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none — analytics) |
| MVP? | No (V3) |

### Main flow
1. VP creates a cohort: guests with X property pattern, Y stay frequency, Z preference
2. System runs analysis on cohort
3. Shows: behaviour patterns, complaint themes, suggested actions

### Acceptance criteria
- AC-26.1: Cohort definitions are saveable and re-runnable
- AC-26.2: Analysis completes in ≤ 30 seconds for cohorts of up to 5,000 guests

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-26-1 | As a VP, I can define a cohort | 5 |
| US-26-2 | As a VP, I see cohort analytics | 5 |
| US-26-3 | As a VP, I save and re-run cohorts | 3 |

### Dependencies
- Analytics warehouse

---

## UC-27 — Tutor / Manager Onboarding (Account Setup)

| Field | Value |
|---|---|
| Primary actor | Admin |
| Secondary actors | New user (recipient) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No |

### Notes
"Tutor/Manager onboarding" is a label inherited from the prompt template; in Roomard context, this is **staff onboarding** — admin invites new staff members and assigns roles.

### Main flow
1. Admin enters new user's email, name, role, property assignment(s)
2. System sends invite email with magic link
3. New user activates account, sets password (or SSO if enabled)
4. New user sees role-appropriate onboarding flow

### Acceptance criteria
- AC-27.1: Invite-to-active completes in ≤ 5 minutes for a typical user
- AC-27.2: Roles are correctly applied
- AC-27.3: Onboarding flow is role-specific

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-27-1 | As an Admin, I invite a new staff member with role and properties | 3 |
| US-27-2 | As a new user, I activate via email link | 3 |
| US-27-3 | As a new user, I see role-specific onboarding | 3 |

### Dependencies
- UC-28 (role definitions)

---

## UC-28 — Role-Based Access Management

| Field | Value |
|---|---|
| Primary actor | Admin |
| Secondary actors | System |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (foundational — required before multi-tenant launch) |

### Main flow
1. Admin defines roles (out of box: Admin, GM, VP, FD Manager, FD Agent, Concierge, Housekeeping Supervisor, Housekeeper, F&B Manager, DPO, Auditor)
2. Each role has permissions defined per surface and per data class
3. Admin assigns roles to users
4. System enforces permissions on every request

### Acceptance criteria
- AC-28.1: Out-of-box roles cover 95% of use cases without customisation
- AC-28.2: Permission check overhead ≤ 50ms per request
- AC-28.3: Permissions are audit-logged on access denial

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-28-1 | As an Admin, I see and manage roles | 3 |
| US-28-2 | As a System, I enforce permissions on every request | 5 |
| US-28-3 | As a System, I log permission denials | 3 |

### Dependencies
- Foundational; before most other UCs in production

---

## UC-29 — SSO Integration (SAML / OIDC)

| Field | Value |
|---|---|
| Primary actor | IT Admin (customer side) |
| Secondary actors | Tenant Admin (Roomard side) |
| Surface | **Web only** |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | **Yes (procurement gate)** |

### Main flow
1. Customer IT Admin provides SAML or OIDC IdP metadata to Roomard
2. Roomard tenant configures the IdP
3. Test login flow
4. Production cutover; staff users authenticate via SSO

### Acceptance criteria
- AC-29.1: Supports Microsoft Entra ID, Okta, Google Workspace as IdPs
- AC-29.2: SAML 2.0 and OIDC both supported
- AC-29.3: SSO setup achievable in ≤ 30 minutes for a typical IdP

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-29-1 | As an IT Admin, I configure SAML SSO for my tenant | 5 |
| US-29-2 | As a Staff User, I log in via my company SSO | 3 |
| US-29-3 | As an IT Admin, I configure OIDC alternatively | 3 |

### Dependencies
- UC-28 (role management)

---

## UC-30 — Tenant Provisioning (Group-Level)

| Field | Value |
|---|---|
| Primary actor | Roomard internal admin (during sales onboarding) |
| Secondary actors | Customer Admin |
| Surface | Internal admin web |
| Sprint size | **1 sprint** |
| AI components | (none) |
| MVP? | No (operational, not customer-facing) |

### Main flow
1. Roomard ops creates tenant: group name, contracted tier, billing reference, property list, data residency settings
2. System provisions: tenant database, tenant storage bucket, default roles, default settings
3. First customer Admin invited
4. Sales handover to Customer Success

### Acceptance criteria
- AC-30.1: Tenant provisioning completes in ≤ 15 minutes
- AC-30.2: Tenant isolation verified by automated test
- AC-30.3: First Admin invitation sent

### User stories
| Story ID | Story | Points |
|---|---|---|
| US-30-1 | As an Ops user, I create a tenant | 5 |
| US-30-2 | As a System, tenant isolation is verified | 5 |
| US-30-3 | As an Ops user, I trigger handover to Customer Success | 2 |

### Dependencies
- Multi-tenant infrastructure (foundational)

---

## A. MVP scope (recap)

| UC | Sprints |
|---|---|
| UC-01 — Capture handwritten check-in card | 1 |
| UC-07a + UC-07b — Daily arrival brief | 2 |
| UC-08 — Mid-conversation guest lookup | 1 |
| UC-09 — Housekeeping room prep card | 1 |
| UC-23 — Exception queue | 1 |
| UC-24a — PMS inbound sync (Mews) | 1 |
| UC-25 — Review polling | 1 |
| UC-29 — SSO | 1 |
| **MVP total** | **9 sprints** |

Add 1 sprint for environment setup, CI/CD, and reading-out, total **10 sprints** to MVP. At 1-week sprints, **~10 weeks** to first customer-ready build.

---

## B. Use case summary table

| UC | Title | Surface | Sprints | MVP? | Dependencies |
|---|---|---|---|---|---|
| UC-01 | Capture handwritten check-in card | Mobile primary | 1 | ✅ | UC-23, UC-24a |
| UC-02 | Capture paper room service ticket | Mobile primary | 1 |  | UC-01 patterns |
| UC-03a | Email thread ingestion | Background | 1 |  |  |
| UC-03b | Email thread extraction & linking | Web | 1 |  | UC-03a |
| UC-04 | Supervisor voice memo (preference) | Mobile primary | 1 |  |  |
| UC-05a | External review ingestion | Background | 1 | ✅ |  |
| UC-05b | Review-to-guest linking | Web | 1 | ✅ | UC-05a |
| UC-06a | Identity candidate detection | Background | 1 |  |  |
| UC-06b | Identity merge human review | Web | 1 |  | UC-06a |
| UC-07a | Daily brief generation | Background | 1 | ✅ | UC-24a |
| UC-07b | Daily brief distribution | Web + Mobile | 1 | ✅ | UC-07a |
| UC-08 | Mid-conversation guest lookup | Mobile primary | 1 | ✅ | UC-24a |
| UC-09 | Housekeeping room prep card | Mobile + Web | 1 | ✅ | UC-24a |
| UC-10 | F&B service prep | Web primary | 1 |  | UC-24a |
| UC-11 | Complaint trajectory flag | Web | 1 |  |  |
| UC-12 | Per-guest narrative summary | Web + Mobile | 1 |  |  |
| UC-13 | Pre-arrival proactive prep (D-3) | Web | 1 |  | UC-24a |
| UC-14 | Preference correction / merge | Web | 1 |  |  |
| UC-15 | Cross-property journey view | Web only | 1 |  | UC-06 |
| UC-16a | Brand-standard metrics | Web only | 1 |  |  |
| UC-16b | Drill-down | Web only | 1 |  | UC-16a |
| UC-17 | OTA recapture tracking | Web only | 1 |  |  |
| UC-18a | DPO subject access surface | Web only | 1 |  |  |
| UC-18b | Guest privacy panel | Web (public) | 1 |  |  |
| UC-19 | Right-to-be-forgotten purge | Web only | 1 |  |  |
| UC-20 | Audit pack export | Web only | 1 |  | UC-21 |
| UC-21 | Audit log review | Web only | 1 |  |  |
| UC-22 | Witness voice note | Mobile primary | 1 |  | UC-04 |
| UC-23 | Exception queue | Web primary | 1 | ✅ |  |
| UC-24a | PMS inbound sync | Background | 1 | ✅ |  |
| UC-24b | PMS outbound sync | Background | 1 |  | UC-24a |
| UC-24c | Conflict resolution | Web | 1 |  | UC-24a, UC-24b |
| UC-25 | Review polling | Background | 1 | ✅ |  |
| UC-26 | Multi-property cohort analytics | Web only | 1 |  |  |
| UC-27 | Staff onboarding | Web only | 1 |  | UC-28 |
| UC-28 | Role-based access | Web only | 1 |  |  |
| UC-29 | SSO | Web only | 1 | ✅ | UC-28 |
| UC-30 | Tenant provisioning | Internal | 1 |  |  |
| **Total** | | | **37 sprints** | **8 MVP** | |

---

## C. Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 18 May 2026 | Senthil with Claude | Initial catalogue, 30 UCs, 37 sprint-sized units |

---

*End of Roomard Use Case Catalogue v1.0 — 18 May 2026.*
