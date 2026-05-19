# Roomard — Business Requirements Document v2.0

**The AI Guest Memory Engine for Mid-Tier Hotel Groups**

| Field | Value |
|---|---|
| Document | Roomard BRD v2.0 (Enterprise-grade, supersedes v1.0) |
| Date | 18 May 2026 |
| Author | Senthil (with Claude) |
| Status | Approved for build planning |
| Tech stack constraint | Full Baidu/MeDo (MeDo, ERNIE 4.5, ERNIE X1, PaddleOCR-VL, Qianfan MaaS) |
| Surfaces | Web app (primary operator surface) + Mobile app (front-desk, housekeeping, supervisor) — both mandatory |
| Sprint cadence | 1-week sprints, 3–5 user stories per sprint |
| Supersedes | `03_Roomard_Lifestyle_Game.md` (Roomard BRD v1.0, 14 May 2026) |

---

## 0. What changed from v1.0

This is not a re-statement of v1.0. It's an upgrade against the dimensions v1.0 did not address because v1.0 was framed as a hackathon BRD:

| Dimension | v1.0 | v2.0 |
|---|---|---|
| Surface | Implicit (one product) | Explicit web + mobile, mandatory both |
| Sprint planning | None | 1-week sprints, granular use cases |
| Architecture | Tech-stack % breakdown only | Real architecture document follows separately |
| Traceability | None | Live traceability matrix follows separately |
| Tech stack | "Use sponsor stack" | Baidu stack as hard constraint, with named constraint-implications |
| Data residency | Risk-flagged | Designed in from day one (see §15) |
| GTM | Not covered | Covered (§14) |
| Unit economics | Pricing only | First-50-customer maths (§13) |
| Moat | One-line claims | Defensibility thesis with timelines (§12) |
| Constraint implications | Buried in risks | Surfaced as a dedicated section (§16) |

If reading v2.0 alone, the substance is self-contained. v1.0 remains in the repository as the original hackathon framing.

---

## 1. Executive summary

Roomard is the **multimodal guest memory layer** that sits between a hotel's PMS, its property-floor operations, and its external review/feedback streams — turning unstructured guest interaction data into structured, recallable preference profiles that improve every subsequent stay.

The single buyer pain it solves: mid-tier hotel groups (10–500 properties) are losing direct-booking margin to OTAs because they cannot remember their guests well enough to give them a materially better second stay. The data needed to remember exists, but it is trapped in handwritten cards, room service tickets, email threads, voice memos, and reviews. No system today consolidates it.

Buyer ROI is unambiguous. A 30-property mid-tier UK group paying ~£20M/year in OTA commissions can recapture ~£1.5M/year with a six-point lift in direct repeat-booking rate. Group-tier Roomard pricing recovers this investment in roughly five weeks. The financial case is the cleanest in hotel tech.

The product wins on three things competitors structurally don't do: (1) ingestion of paper and voice as first-class sources, not as afterthoughts; (2) cross-property identity and trajectory tracking, not just per-property profiles; (3) a front-desk-shaped UX rather than a sales-CRM-shaped UX. The competitive window before this becomes commodity is 12–18 months. The product needs to land its first reference customer within 6 months to defend that window.

The product is built on the Baidu stack (MeDo, ERNIE 4.5, ERNIE X1, PaddleOCR-VL, Qianfan MaaS) by deliberate constraint. This creates two real implications — UK/EU data residency and ERNIE's English performance on hospitality vocabulary — which are designed in, not papered over.

The product ships as a web application (operator surface) and a mobile application (front-line and supervisor surface). Both are mandatory. A web-only product cannot serve the housekeeping supervisor walking a corridor or the front-desk agent moving through a lobby. A mobile-only product cannot serve the Head of Quality running cross-property analytics. The dual surface is foundational, not optional.

---

## 2. Problem statement (deep)

### 2.1 The strategic squeeze on mid-tier hotel groups

The mid-tier hotel segment — properties in the £100–£400/night range, 10–500 properties per group — is in a structural margin compression. Three forces drive it:

**OTA dependence.** Booking.com, Expedia, Airbnb, Vrbo and the platform aggregators take 15–22% commission on bookings made through them. The industry average sits around 18%. For a 400-room mid-tier London property running at 78% occupancy, this is roughly £2.1M/year paid in OTA commissions. A 30-property group of similar profile pays £55–70M/year industry-wide. Every basis point recaptured to direct booking is direct margin.

**Personalisation as the only direct-booking weapon.** Mid-tier groups cannot win on price (OTAs aggregate price discovery), cannot win on reach (OTAs own the demand funnel), and cannot win on convenience (mobile-first booking is now table stakes). The only structural weapon they have is **the second stay being materially better than the first**. A guest who books direct on the second stay saves the property 18% commission and — per Cornell Hospitality Quarterly — represents 3.2× the five-year customer lifetime value of a first-time guest.

**Memory is the bottleneck.** The personalisation that earns the direct second booking depends on remembering the first guest. Mid-tier groups cannot do this. Direct repeat-booking rates sit at 18–24% (STR / Phocuswright). Luxury chains with proper CRM run 38–55%. The gap is not effort or intent — it is structural memory failure.

### 2.2 Where the guest memory data actually lives

The personalisation data exists. It is not missing. It is fragmented across eleven channels, none of which the PMS sees:

1. **Handwritten check-in cards.** Estimated 40–55% of mid-tier UK hotels still use paper cards at check-in for at least guest signature and preference capture.
2. **Paper room service tickets and dockets.** Notes about complaints, comps, preferences scribbled by F&B staff.
3. **Housekeeping shift logs.** "Guest in 412 asked for extra pillows three times — fluffy ones."
4. **Maintenance tickets.** "Guest complained AC was noisy — moved to 615."
5. **Concierge email threads.** Restaurant bookings, theatre tickets, allergy briefings, family event coordination.
6. **WhatsApp/SMS threads** with the concierge — increasingly the default channel.
7. **Voice memos and verbal handovers** between shifts — institutional knowledge that never gets written down.
8. **External review platforms** — TripAdvisor, Booking.com, Google, expedia.co.uk. Sentiment + specific complaints, but only retroactively.
9. **Loyalty program data** — points and tier only, no preferences.
10. **Tip patterns** — which staff member, what amount, on what stay — a signal of what mattered to the guest.
11. **Direct guest emails to the general manager** — complaints, praise, follow-up.

The PMS — Opera, Mews, Cloudbeds, Protel, RoomRaccoon, Apaleo — sees stay dates, room numbers, revenue, and a free-text "guest notes" field that is universally under-maintained because typing into it produces no immediate operational value for the agent doing the typing.

### 2.3 What this costs the buyer, quantified

| Metric | Value | Source / basis |
|---|---|---|
| Mid-tier hotel direct repeat-booking rate | 18–24% | STR Global / Phocuswright benchmark reports |
| Luxury hotel direct repeat-booking rate | 38–55% | Same |
| OTA commission rate (industry average) | 15–22% (avg ~18%) | Skift Research, AHLA |
| Repeat-guest 5-year LTV multiplier | 3.2× new guest | Cornell Hospitality Quarterly |
| Front-desk staff annual turnover | 62% | American Hotel & Lodging Association 2024 |
| Avg OTA spend for 400-room mid-tier London property | £1.4–2.6M/year | Computed from property revenue × occupancy × OTA mix × commission rate |
| Industry CRM penetration in mid-tier (proper personalisation CRM) | < 20% | Hospitality Technology benchmark surveys |

The financial gap a 6-point lift in direct repeat-booking creates for a 30-property mid-tier group is approximately **£1.5M/year recaptured from OTAs**. This is the cleanest ROI in hotel tech.

### 2.4 What this is not

Roomard is explicitly not:
- A PMS replacement (it sits next to Opera/Mews/Cloudbeds, not in place of them)
- A loyalty platform (Bonvoy/IHG One/Hilton Honors solve a different problem)
- A booking engine (it doesn't sell rooms)
- A revenue management tool (Duetto, IDeaS — different category)
- A review aggregator alone (Revinate/ReviewPro overlap on one feature, not the spine)
- A generic CRM (Salesforce Hospitality Cloud is sales-shaped; we are operations-shaped)

This delimitation matters because the procurement conversation will repeatedly try to collapse Roomard into one of the above. The answer in every case is "no — we are the layer that makes those systems remember."

---

## 3. Why the problem exists (root causes)

Four causes, in order of severity:

### 3.1 The PMS data model was built for billing, not for memory

PMS systems were architected in the 1990s–2000s as transactional billing systems for the front office. Their core data model is `Stay = Guest × Room × DateRange × Folio`. The "guest" entity is a thin shell — name, contact details, payment method, loyalty tier, free-text notes. There is no first-class concept of *preference*, *sentiment*, *trajectory*, *cross-property identity*, or *evidence source*. The free-text notes field exists but is a textarea, not a structured field, and nobody updates a textarea at scale.

Opera Cloud, Mews, and Cloudbeds have all added "guest profile" features over the last 5 years, but these remain shallow because the underlying data model treats the guest as a counterparty to a billing record rather than as a longitudinal entity. The PMS vendors will improve this slowly — but the gap is the wedge.

### 3.2 Personalisation requires multimodal synthesis no human has time to do

The dietary note is in the F&B system. The complaint is in the maintenance log. The praise is on TripAdvisor. The tip pattern is in the payroll system. The personal context (anniversary, family member's name) is in the concierge's email folder. The signed preference card is in a filing cabinet.

To prepare a personalised greeting for an arriving guest, someone needs to pull from six systems, read prose written by six different people, and synthesise a one-paragraph brief. At 34 arrivals/day in a 240-room property, that is approximately 2.5 hours of cognitive work per day for one person who has eleven other responsibilities. It does not happen. The brief is replaced by "let me look you up... ah, welcome back."

### 3.3 Staff turnover destroys tribal knowledge faster than it can be transcribed

Front-desk turnover at 62%/year means that the 24-year-old who knew every regular by name has on average left within 19 months. Concierge tenure averages slightly higher (28 months) but the principle holds: the institutional memory of guests lives in the heads of staff, and those heads change.

Training the replacement does not solve this. The replacement starts at zero. Worse, the leaver often goes to a competitor property in the same city, taking the memory of *your* guests with them.

### 3.4 The economics of bespoke CRM exclude mid-tier groups

Salesforce Hospitality Cloud, Cendyn, and Revinate at the higher tiers cost £80k–£400k per group per year with 9–14 month implementations. This is rational economics for the buyer — these are heavy systems built for chains with 500+ properties and dedicated CRM teams. The mid-tier group at 10–200 properties cannot justify the cost and cannot absorb the implementation friction. The result is a £4–8bn-per-year market category (guest CRM for mid-tier hospitality) that is structurally underserved.

This is Roomard's market.

---

## 4. Target market and TAM

### 4.1 Segmentation

| Segment | Properties per group | Geography focus | TAM estimate (Roomard pricing × addressable count) |
|---|---|---|---|
| Independent boutique luxury | 1–3 | UK, EU, US, AU | ~7,500 properties × £8k = **£60M/year addressable** |
| Mid-tier regional groups | 10–50 | UK, EU primary | ~1,200 groups × £140k = **£168M/year addressable** |
| Hotel management companies (HMCs) running multi-brand portfolios | 30–200 | UK, EU, US, MENA | ~280 HMCs × £450k = **£126M/year addressable** |
| Large mid-tier chains | 200–500 | Global | ~85 chains × £900k = **£76M/year addressable** |
| **Total TAM (initial 5 geographies)** | | | **~£430M/year ARR** |

This is the **serviceable addressable market** for the Roomard category, not the full global TAM. Adding APAC, LATAM, and lower mid-tier independents expands this to roughly **£900M–£1.1bn/year** in ARR over a 10-year horizon. This is a billion-dollar category, not a feature.

### 4.2 Why this TAM is real, not theoretical

Three validating signals:
- Canary Technologies raised a $50M Series C in 2024 at a $400M+ valuation targeting a subset of this exact market (guest messaging, a thinner version of guest memory).
- Cendyn (legacy) was acquired by Accor-Invest in a portfolio move signalling the strategic value.
- Revinate IPO'd in 2021 at a peak valuation of $850M off a narrower product (review aggregation + survey).

These are validating comparables. Roomard is a deeper product than any of them.

---

## 5. Target users (buyer-vs-user split, deep)

### 5.1 Economic buyer

**Title:** VP of Guest Experience / Group Director of Hotels / Chief Operating Officer at a hotel group; or Operations Director at a Hotel Management Company.

**What they are measured on:** Direct booking rate, RevPAR, guest satisfaction (NPS or equivalent), cross-property consistency, OTA commission spend as % of room revenue.

**The conversation that opens the wallet:** "Our direct repeat-booking rate has been flat at 22% for three years. We are paying £18M/year in OTA commissions. Our brand-standard audits show inconsistent guest experience across properties. We need something that does not require a 9-month rollout."

**Budget authority:** £8k–£25k per property per year, or £150k–£600k group-level. Above that, requires CFO + IT sign-off.

**Procurement gates:** ISO 27001 or SOC 2, GDPR DPA, ICO registration, PMS integration certification (especially Mews and Opera Cloud), data residency commitment.

### 5.2 Primary users (daily users)

| Role | Frequency | Primary surface | Key tasks |
|---|---|---|---|
| Front Desk Manager | Daily, every morning | Web + Mobile | Reviews arrival brief, briefs team, handles VIP and exception flags |
| Front Desk Agent | Continuous during shift | Mobile primary, web fallback | Mid-conversation guest lookup, capture new preferences, log incidents |
| Concierge | Daily | Web | Pre-arrival prep, restaurant/activity prep, manage email threads |
| Guest Services Agent | Continuous during shift | Mobile primary | Guest lookup during phone or in-person interaction |

### 5.3 Secondary users (frequent but not daily)

| Role | Frequency | Primary surface | Key tasks |
|---|---|---|---|
| Housekeeping Supervisor | Daily, pre-shift | Mobile primary | Receives room prep cards for the day's arrivals, dispatches to housekeeping team |
| Housekeeper | Per room | Mobile only (lightweight) | Sees per-room prep card, marks complete |
| F&B Manager | Pre-service | Web | Sees dietary restrictions and prior complaints for tonight's guests in restaurant |
| Maintenance Lead | Ad-hoc | Mobile | Logs incidents linked to guest profile |

### 5.4 Tertiary users (occasional but strategic)

| Role | Frequency | Primary surface | Key tasks |
|---|---|---|---|
| Workplace Supervisor / On-site Manager | Weekly | Web | Trajectory dashboards per guest, intervention flags |
| Group GM / Brand Director | Weekly–monthly | Web only | Cross-property consistency dashboards, brand-standard reporting |
| VP Guest Experience | Monthly | Web only | Executive dashboards, ROI reporting, OTA-commission-recapture tracking |
| Data Privacy Officer | Ad-hoc | Web only | Audit logs, GDPR subject access request fulfilment, retention policy enforcement |
| External Verifier / Auditor | Per audit | Web only | Audit-pack export, evidence chain review |

### 5.5 Excluded users (deliberate)

- The hotel **guest** is not a user of Roomard. They experience the result. They may interact only via the **privacy panel** (a guest-facing GDPR self-service surface — view, correct, delete data on their profile) — but this is a compliance feature, not a product surface in the daily sense.
- Marketing teams are explicitly **not** primary users. Roomard is operations-shaped, not marketing-shaped. This is a deliberate positioning choice that differentiates from Cendyn and Revinate.

---

## 6. Use cases — granular and sprint-sized

This section is a high-level catalogue. The detailed Use Case Catalogue is a separate document (delivered next) where each use case is broken into its own specification with actor, preconditions, main flow, alternate flows, postconditions, acceptance criteria, web-vs-mobile mapping, and the user stories that compose it.

### 6.1 Use case catalogue (high-level)

| UC ID | Use Case | Primary actor | Primary surface | Sprint size estimate |
|---|---|---|---|---|
| UC-01 | Capture handwritten check-in card | Front Desk Agent | Mobile | 1 sprint |
| UC-02 | Capture paper room service ticket | F&B Server | Mobile | 1 sprint |
| UC-03 | Ingest concierge email thread | System (event-driven) + Concierge | Web | 2 sprints (split into UC-03a, UC-03b) |
| UC-04 | Capture supervisor voice memo as preference note | Front Desk Manager | Mobile | 1 sprint |
| UC-05 | Ingest external review (TripAdvisor / Booking / Google) | System (scheduled) | Web (display) | 2 sprints (split into UC-05a ingestion, UC-05b linking) |
| UC-06 | Cross-property identity resolution | System (event-driven) | Web (review surface) | 2 sprints (split UC-06a candidate detection, UC-06b human review) |
| UC-07 | Generate daily arrival brief | System (scheduled 6am) | Web + Mobile | 2 sprints (split UC-07a generation, UC-07b distribution) |
| UC-08 | Mid-conversation guest lookup | Front Desk Agent | Mobile primary | 1 sprint |
| UC-09 | Generate housekeeping room prep card | System (event-driven on arrival D-1) | Mobile (housekeeping) | 1 sprint |
| UC-10 | F&B service prep (dietary / prior complaint flag) | F&B Manager | Web | 1 sprint |
| UC-11 | Complaint trajectory flag (3-issue rule) | System (event-driven) | Web | 1 sprint |
| UC-12 | Generate per-guest narrative summary | System on-demand | Web + Mobile | 1 sprint |
| UC-13 | Pre-arrival proactive prep (D-3 sweep) | System (scheduled) | Web | 1 sprint |
| UC-14 | Guest preference correction / merge | Concierge / Front Desk Manager | Web | 1 sprint |
| UC-15 | Cross-property guest journey view | Group GM / Brand Director | Web only | 1 sprint |
| UC-16 | Brand-standard consistency dashboard | Group GM / Brand Director | Web only | 2 sprints (split UC-16a metrics, UC-16b drill-down) |
| UC-17 | OTA-commission-recapture tracking | VP Guest Experience | Web only | 1 sprint |
| UC-18 | GDPR subject access request fulfilment | Data Privacy Officer + Guest | Web (DPO) + Guest panel | 2 sprints (split UC-18a DPO surface, UC-18b guest panel) |
| UC-19 | Right-to-be-forgotten purge | Data Privacy Officer | Web only | 1 sprint |
| UC-20 | Audit pack export for external verifier | Data Privacy Officer | Web only | 1 sprint |
| UC-21 | Audit log review | DPO / Compliance | Web only | 1 sprint |
| UC-22 | Voice memo to structured witness note | Supervisor | Mobile | 1 sprint |
| UC-23 | Confidence-and-exception review queue | Concierge / Front Desk Manager | Web primary | 1 sprint |
| UC-24 | PMS bidirectional sync (Mews flagship) | System (continuous) | (background) | 3 sprints (split UC-24a inbound, UC-24b outbound, UC-24c conflict resolution) |
| UC-25 | TripAdvisor / Booking / Google review polling | System (scheduled) | (background) | 1 sprint |
| UC-26 | Multi-property cohort analytics | VP Guest Experience | Web only | 1 sprint |
| UC-27 | Tutor / Manager onboarding (account setup) | Admin | Web only | 1 sprint |
| UC-28 | Role-based access management | Admin | Web only | 1 sprint |
| UC-29 | SSO integration (SAML / OIDC) | IT Admin | Web only | 1 sprint |
| UC-30 | Tenant provisioning (group-level) | Admin (Roomard side) | Internal admin | 1 sprint |

**Sprint total estimate:** ~37 sprints to deliver full UC-01 through UC-30 (with the 7 UCs that split). At 1-week sprints, full-feature delivery = ~9 months. MVP (UC-01, UC-07, UC-08, UC-09, UC-23, UC-24a, UC-25, UC-29) = 8 use cases = ~10 sprints = ~10 weeks.

### 6.2 The "wedge" use cases (MVP scope)

The product cannot ship all 30 use cases at once. The wedge that lands the first reference customer is the **Daily Arrival Brief + Mid-Conversation Lookup + Mews Integration**:

- **UC-01** Capture handwritten check-in card (proves the OCR moment)
- **UC-07** Daily arrival brief (the killer feature for the buyer)
- **UC-08** Mid-conversation guest lookup (the killer feature for the user)
- **UC-09** Housekeeping room prep card (proves multi-surface)
- **UC-23** Confidence-and-exception review queue (proves trust)
- **UC-24a** Mews inbound sync (proves PMS integration)
- **UC-25** TripAdvisor review polling (proves external-source ingestion)
- **UC-29** SSO (procurement gate)

Everything else is V2 and beyond. Sprint plan document (delivered separately) sequences this exactly.

---

## 7. Surfaces — web and mobile, both mandatory

### 7.1 Why both surfaces are mandatory

A web-only product fails because:
- The housekeeping supervisor walking a corridor cannot pull up a web browser to check the room prep card for room 412
- The front-desk agent moving between the lobby and the desk needs guest lookup in hand, not on a screen 6 metres away
- The F&B server cannot photograph a paper service ticket on a desktop browser

A mobile-only product fails because:
- The Head of Quality running a cross-property dashboard at 5pm cannot do it on a 6-inch screen
- Bulk operations (preference correction, audit pack export, multi-guest review) are inhumane on mobile
- The DPO fulfilling a GDPR subject access request needs the full audit trail in a desktop context

Both surfaces are first-class, but they are **role-segregated**: not every role uses both. The Group GM never uses mobile; the Housekeeper never uses web. The Front Desk Manager uses both. This role-surface mapping is captured per use case in the Use Case Catalogue.

### 7.2 Surface ownership per use case (summary)

| Surface | Use cases owned | Roles served |
|---|---|---|
| Web only | UC-15, UC-16, UC-17, UC-19, UC-20, UC-21, UC-26, UC-27, UC-28, UC-29, UC-30 | GM, DPO, VP, Admin |
| Mobile only | (none — every mobile UC has a web fallback) | — |
| Web + Mobile (both first-class) | UC-07, UC-08, UC-12, UC-23 | Front Desk Manager, Concierge |
| Mobile primary, web fallback | UC-01, UC-02, UC-04, UC-09, UC-22 | Front-line staff |
| Web primary, mobile fallback | UC-03, UC-05, UC-10, UC-13, UC-14, UC-18 | Concierge, F&B Manager, DPO |
| Background (no UI) | UC-06, UC-11, UC-24, UC-25 | System |

### 7.3 Mobile platform decision

Mobile must run on both iOS and Android. The mid-tier hotel industry runs both. We will not build native twice. Two viable approaches:

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **PWA (Progressive Web App)** | Single codebase, fast iteration, no app store gates, works offline | Camera capture quality limitations, less reliable background sync, no native push reliability | Phase 1 (MVP) |
| **React Native** | Real native camera, native push, native offline DB | Two-codebase complexity, app store review cycles, slower iteration | Phase 2 (post-MVP, once OCR-from-camera quality is critical) |
| **Native iOS + Android** | Best UX | 2× engineering cost, slower roadmap | Rejected |

Phase 1 ships as PWA. Phase 2 transitions camera-heavy use cases (UC-01, UC-02) to React Native if OCR quality from PWA camera proves insufficient. This is a measured decision, not a default — to be tested in sprint 3 of the build.

### 7.4 Web platform decision

| Choice | Rationale |
|---|---|
| **Framework** | React + TypeScript |
| **Generation tool** | MeDo (per stack constraint) generates the initial scaffold; React/TS becomes the long-term maintained codebase |
| **Auth** | OIDC, with SAML for enterprise tier |
| **Hosting** | Baidu AI Cloud (per stack constraint), with documented EU-resident storage for guest data |
| **Component library** | shadcn/ui + Tailwind (deliberate choice for fast iteration; permitted within MeDo scaffold) |

---

## 8. Tech stack with constraint honoured

### 8.1 Stack mandate

Per agreed constraint: **Full Baidu/MeDo stack.** No swapping to AWS Textract, Google Cloud Vision, OpenAI, Anthropic, etc. Where the stack has a gap, we engineer around it within the stack — we do not break the constraint.

### 8.2 Component breakdown

| Component | Role | % of product | What it does specifically |
|---|---|---|---|
| **MeDo** | App generation + multi-agent orchestration | 30% | Generates web app scaffold (React/TS); orchestrates multi-agent pipelines (e.g., card-photo → OCR agent → entity-extraction agent → confidence-scoring agent → exception-router agent) |
| **PaddleOCR-VL** | Layout-aware OCR | 15% | Extracts text + structure from photographed handwritten cards, paper service tickets, signed receipts; multilingual |
| **ERNIE 4.5 (Qianfan)** | Multimodal NLU + generation | 25% | Entity extraction from text/images; sentiment scoring of reviews; voice-memo transcription; arrival-brief narrative generation; cross-source synthesis |
| **ERNIE X1 (Qianfan)** | Reasoning | 15% | Arrival prioritisation; cross-stay trajectory analysis; complaint-trajectory flagging; cross-property identity matching |
| **Qianfan MaaS** | API gateway, rate limiting, audit | 5% | Single point of API access; per-tenant rate limiting; audit logging of every AI call (critical for the audit-log use case) |
| **Non-AI plumbing** | Storage, integration, role/auth, web/mobile UI runtime | 10% | Postgres-equivalent (Baidu RDS); object storage (Baidu BOS, EU-resident bucket); PMS connectors; SSO; webhook/queue infrastructure; mobile PWA shell |
| **Total** | | **100%** | |

### 8.3 What runs where

| Layer | Hosted on |
|---|---|
| Web app frontend | Baidu Cloud CDN (with EU edge nodes) |
| Mobile app distribution | App stores (iOS / Android) for Phase 2 native; web for Phase 1 PWA |
| API gateway | Qianfan MaaS |
| Application services | Baidu Cloud Compute (Singapore region for inference, EU edge for data) |
| Inference (OCR + LLM) | Qianfan MaaS endpoints (Singapore / Hong Kong) |
| Guest data store (PII) | Baidu BOS EU-resident bucket + Baidu RDS EU region if available; if no EU RDS, contractual data-processing-agreement chain via SCCs |
| Audit log | Append-only, EU-resident, retained 7 years |

The constraint that Baidu does not currently have a full EU region creates a real engineering ask: PII storage must be EU-resident under SCCs, inference can transit to Singapore region under data-minimisation rules (we send only the text needed for inference, not the full guest record, and we do not persist anything inference-side). This is designed in. See §16.

---

## 9. AI honesty section (deep)

### 9.1 What percentage of the product is AI

**~55%.** PaddleOCR-VL + ERNIE 4.5 + ERNIE X1 combined.

### 9.2 Who uses the AI

| Role | How they consume AI | Visibility of AI to user |
|---|---|---|
| Front Desk Manager | Daily arrival brief is AI-generated | Mostly invisible; AI's reasoning is shown if they tap "why" |
| Front Desk Agent | Lookup synthesises 6 sources via AI | Invisible — they see the result |
| Concierge | Email-thread preference extraction is AI | Visible in the exception queue when AI is unsure |
| Housekeeping Supervisor | Room prep card is AI-assembled | Invisible |
| DPO | Audit log shows every AI call | Fully visible — auditability is the feature |
| Guest | AI never speaks to the guest directly | Invisible — guest only sees the experience |

### 9.3 Why AI is necessary, claim by claim

| Claim | Why a rule-based system cannot replace AI here |
|---|---|
| Handwritten card OCR | Cursive English varies wildly per person; international names are non-Latin script; rule-based OCR fails consistently |
| Cross-source synthesis into a 1-page brief | Six prose sources written in six styles by six people across three years cannot be combined by SQL |
| Sentiment extraction from reviews | "The eggs were over-cooked" vs "The eggs were too soft" — semantically distinct, lexically similar |
| Cross-property identity resolution | Same person, slightly different name spelling, different email — entity resolution is canonical AI work |
| Arrival prioritisation | "Which 8 of 34 arrivals deserve attention today" depends on trajectory, recency, prior issues — not a rules engine |
| Voice-memo to structured note | Speech-to-text + structured extraction; rule-based regex on transcripts fails |

### 9.4 What happens without AI

A non-AI Roomard is **a slightly nicer guest-notes textarea that the PMS already has**. It can store free-text comments that a human types. It cannot ingest cards. It cannot extract preferences from email threads. It cannot synthesise daily briefs. It cannot link TripAdvisor reviews to guest profiles. It cannot detect declining-experience trajectories. It cannot resolve cross-property identity.

The honest assessment: there is no plausible non-AI version of Roomard. The AI is not a feature — it is the spine. Removing the AI removes the product.

This honesty matters because procurement teams will ask "what if we use this without the AI?" — and the answer is "you have already tried that. It is the guest notes textarea you have not been filling in for ten years."

---

## 10. Competitive analysis (honest)

### 10.1 Feature-proximity and catch-up matrix

| Competitor | Feature proximity | Catch-up timeline if they prioritised it | Moat / structural weakness |
|---|---|---|---|
| **Canary Technologies** | 55% | 6–10 weeks for the daily arrival brief; ~6 months for the deep multimodal stack | AI-native, fast-moving, well-funded ($50M Series C). Their current product is guest *messaging* — they have to extend, not invent. **Real threat.** |
| **Cendyn CRM (now part of Accor-Invest portfolio)** | 65% | 3–6 months for the multimodal layer | Sales-and-marketing CRM positioning, not operations. £80k+ deals. Slow rollout. Strength is brand and distribution. |
| **Revinate** | 60% | 4–8 weeks to integrate AI summarisation more aggressively | Strong on review aggregation and survey response. Marketing-ops persona. Doesn't touch paper/handwriting. |
| **Salesforce Hospitality Cloud** | 50% | 9–12 months to ship a front-desk-shaped product | Big distribution (Marriott, IHG). Heavy. CRM-shaped. Slow vertical product velocity. |
| **For-REI / hotel internal builds (Marriott, IHG, Hilton)** | 70% | 6–12 months for parity | They have the data. They lack the AI plumbing. Not our market — sell to mid-tier before big-chain consolidation. |
| **Duetto / IDeaS** | 30% | Adjacent only — revenue management | Could acquire-and-bundle a guest CRM. **Acquisition risk to us, not competitive risk.** |
| **PMS-native (Opera Cloud, Mews, Cloudbeds, Apaleo)** | 40% | 6–9 months to ship parity if prioritised | They own the data we depend on. **Strategic priority: be a certified Mews app within 6 months; partner before competing.** |
| **In-house spreadsheet + SharePoint** | 15% | Infinite — different category | What 70%+ of mid-tier actually uses. The real incumbent. Must be 10× better to displace. |

### 10.2 The honest competitive read

Canary Technologies is the single direct threat. Same buyer, same shape, faster product velocity than legacy CRMs. Within 18 months either they or one of the PMS vendors ships a parity product.

Roomard's window is **12–18 months**. The win condition is three-fold:
1. Land a flagship mid-tier hotel group (10+ properties) as reference customer within 6 months
2. Be deeply integrated with one specific PMS — **Mews is the strategic bet** (modern, API-first, growing fast)
3. Own one specific operational moment — the **Daily Arrival Brief** — so well that buyers default to Roomard when describing what they want

After that window closes, the category commoditises and the moat shifts to brand and distribution. We need to land the first 25 customers and the Mews partnership before that.

---

## 11. Pricing tiers (refined)

| Tier | Price | What's included | Buyer profile |
|---|---|---|---|
| **Property** | £8,000/property/year | Single hotel, ≤250 rooms, PMS sync, daily briefs, card OCR, mobile + web | Independent boutiques, single-property luxury |
| **Group Starter** | £4,500/property/year, min 10 properties = £45k/year floor | Multi-property memory, cross-property identity, group analytics, brand-standard reporting | 10–30 property regional groups |
| **Group** | £4,000/property/year, min 30 properties = £120k/year floor | Above + dedicated CSM + custom PMS connector + SSO + brand-level segregation | 30–100 property groups, HMCs |
| **Enterprise** | Custom (typically £180k–£600k/year) | Above + SOC 2 report + on-prem option + custom retention + dedicated solution engineer | 100+ property chains, regulated jurisdictions |

### 11.1 Pricing justification (per-tier)

**Property tier (£8k):** Equivalent to ~£32/room/year for a 250-room property. Below the threshold where the GM needs CFO approval. Sold through self-serve + light-touch sales.

**Group Starter (£45k/year floor):** Below £50k procurement-process threshold at most mid-tier groups. Single-buyer signature decision. Margin recovery from OTA recapture pays back in roughly 5 weeks at 22→28% direct repeat-booking lift.

**Group (£120k–£400k/year band):** Requires procurement review but well within budget authority of VP Guest Experience or COO. ROI argument is dominant: a 30-property group spending £20M/year on OTAs recoups the spend many times over.

**Enterprise (£180k–£600k):** Requires CFO + CIO + Legal + Procurement sign-off. 4–7 month sales cycle. Justified by SOC 2 + on-prem + custom integrations + dedicated team.

### 11.2 What we will *not* do on pricing

- **Per-stay or per-transaction pricing.** This penalises busy customers and breaks the buyer's predictability. Flat annual.
- **AI-token usage pricing passed through.** The buyer should not have to think about Qianfan tokens. We absorb that cost as part of margin.
- **Discount-led GTM.** Mid-tier hospitality buyers smell discount as desperation. Hold price; sell value.

---

## 12. Moat and defensibility

### 12.1 What is the moat actually

Three layers, in order of durability:

**Layer 1 — Data network effect (durable).** Every property using Roomard captures preference patterns, complaint patterns, and resolution patterns. Aggregated across the customer base (with strict per-tenant data segregation), this becomes a benchmark: "your guests' room-temperature preference distribution is X; the network average is Y." This benchmark cannot be replicated by a new entrant without comparable customer base. This is the moat that compounds.

**Layer 2 — PMS integration depth (medium durability).** Being a certified Mews app, an Oracle Hospitality partner, and a Cloudbeds-listed marketplace app creates real switching costs and procurement smoothness. Catch-up time for a new entrant: 6–12 months per PMS. Mews partnership is the strategic priority.

**Layer 3 — Operational vocabulary lock-in (medium durability).** When a hotel team uses "Roomard arrival brief" as the noun for the morning operational ritual — the way they use "Slack" as the noun for messaging — the product becomes habit. Habit beats feature parity.

### 12.2 What is *not* the moat

- AI model performance — this is being commoditised by foundation models and Qianfan
- UX polish — competitors can replicate UX in weeks
- Feature breadth — features will be matched within 6–12 months

The model isn't the moat. The customer relationships, the integration depth, and the operational habit are.

---

## 13. Unit economics (first 50 customers)

### 13.1 Customer acquisition cost (CAC) targets

| Tier | Target CAC | Target payback period |
|---|---|---|
| Property (£8k ACV) | £4–6k | 6–9 months |
| Group Starter (£45k ACV floor) | £18–25k | 4–6 months |
| Group (£120k+ ACV) | £40–70k | 5–8 months |
| Enterprise (£300k+ ACV) | £120–200k | 8–12 months |

### 13.2 Cost of goods sold (COGS) per customer

| Cost line | Property (£8k) | Group (£120k) |
|---|---|---|
| Qianfan inference (OCR + LLM tokens) | £600–900/year | £4–6k/year |
| Baidu Cloud hosting + EU storage | £400–600/year | £3–5k/year |
| Support (avg 2 hours/month for Property, 12 hours/month for Group) | £1,200/year | £7,200/year |
| Customer Success allocation | £300/year (pooled) | £8k/year (named CSM 10% allocation) |
| **Total COGS** | **£2,500–3,000** | **£22–26k** |
| **Gross margin** | **65–70%** | **80–82%** |

The Group tier gross margin sits in healthy SaaS territory. The Property tier is thinner — acceptable as long as it serves as a feeder to Group/Enterprise.

### 13.3 First-50-customer revenue mix (target)

| Customer count | Tier | Year-1 ARR contribution |
|---|---|---|
| 20 | Property | £160k |
| 20 | Group Starter | £900k |
| 8 | Group | £960k |
| 2 | Enterprise | £600k |
| **Total** | | **£2.62M ARR off 50 customers** |

This is a realistic 18–24 month trajectory with focused GTM. The Group Starter tier carries the volume; Enterprise carries the marquee logos.

---

## 14. Go-to-market

### 14.1 Sales motion by tier

| Tier | Motion | Channel |
|---|---|---|
| Property | Self-serve + product-led | Direct sign-up, in-product trial, light-touch SDR |
| Group Starter | Inside sales | Outbound + inbound, 3–6 week cycles, single decision-maker |
| Group | Field sales | 4–7 month cycles, multi-stakeholder, demo + pilot |
| Enterprise | Strategic sales | 6–12 month cycles, RFP-driven, dedicated solution engineering |

### 14.2 First 50 customers — sourcing strategy

| Source | Target customer count | How |
|---|---|---|
| Mews marketplace listing | 15 | Be the highest-rated Mews app in guest CRM category |
| HMC partnership (1–2 management companies) | 12–18 | Single HMC running 30+ properties = wedge into many simultaneously |
| Industry conferences (HX, ITB, Hotel Tech Forum) | 8–10 | Targeted demos, post-event nurture |
| PR + content (the OTA-commission-recapture maths is the story) | 5–7 | Trade press: Hospitality Net, Skift, HotelNewsResource |
| Founder network and direct outbound | 5–8 | UK and EU specific |

### 14.3 Why this is realistic

The mid-tier hospitality buyer is reachable. There are ~1,200 mid-tier hotel groups in our initial 5 geographies. A focused 18-month effort can credibly reach 50 of them.

---

## 15. Data, privacy, and compliance design

### 15.1 Data classification

| Class | Examples | Storage region | Retention |
|---|---|---|---|
| Class A (Sensitive PII) | Guest name, email, phone, dietary, religious, health-adjacent preference | EU-resident only | 7 years post last stay, or until guest deletion request |
| Class B (Behavioural) | Stay history, complaint history, preference tags | EU-resident only | 7 years |
| Class C (Operational) | Audit logs, system events | EU-resident, append-only | 7 years (regulatory minimum for some jurisdictions) |
| Class D (Aggregate) | Anonymised network benchmarks | Inference region acceptable | Indefinite |

### 15.2 GDPR posture

- **Lawful basis:** Legitimate interest (operational hospitality service) for primary processing; consent for marketing-adjacent preference inference; explicit consent for any biometric data (we do not store face data).
- **DPA:** Roomard executes a Data Processing Agreement with every customer as standard.
- **Sub-processor list:** Maintained and published. Includes Baidu AI Cloud (data processor, Singapore/Hong Kong for inference under SCCs), and any review platform integrations.
- **DSR (Data Subject Request) fulfilment:** 30-day SLA. UC-18 covers this.
- **Right to be forgotten:** UC-19. Auditable purge across all data stores within 30 days of verified request.
- **Children's data:** Not applicable in scope; we do not process minor guests' data as a category (no special-category handling for minors in the MVP). This is a deliberate scope limitation to flag with buyers.

### 15.3 Security posture

- **Encryption:** At rest (AES-256) and in transit (TLS 1.3).
- **Access control:** Role-based, with audit trail on every read and write of Class A data.
- **Multi-tenant isolation:** Logical separation at the database tier with tenant-prefixed row-level security.
- **SOC 2 Type II:** Target within 18 months of first paid customer.
- **ISO 27001:** Target within 24 months.

### 15.4 Compliance certifications roadmap

| Cert | Target date | Why |
|---|---|---|
| GDPR + UK GDPR compliance (formal posture, DPA published) | Month 3 | Sales gate for any UK/EU customer |
| ICO registration (UK) | Month 2 | Legal requirement for UK data controller |
| Cyber Essentials Plus (UK) | Month 6 | Procurement gate for mid-tier UK buyers |
| SOC 2 Type I | Month 12 | Procurement gate for larger groups |
| SOC 2 Type II | Month 18 | Procurement gate for enterprise tier |
| ISO 27001 | Month 24 | Procurement gate for regulated jurisdictions |

---

## 16. Sponsor-stack constraint implications (named honestly)

This section exists because the Baidu/MeDo stack constraint creates real engineering and commercial implications. They are not show-stoppers, but they are not free either. They are designed in.

### 16.1 UK/EU data residency

**The issue:** Baidu AI Cloud has Singapore, Hong Kong, and mainland China regions, but no EU/UK production region. UK and EU buyers — particularly those under GDPR strict interpretation — will require guest data to be stored in the EU or under equivalent safeguards.

**The design:**
- All Class A (sensitive PII) and Class B (behavioural) data stored in EU-resident object storage. If Baidu BOS does not have an EU edge for production data, fall back to an EU-region cloud storage provider (AWS S3 Frankfurt or equivalent) under our control, with a documented data processing chain. This is the one stack-purity compromise that may be unavoidable, and we will name it explicitly to buyers.
- Inference runs on Qianfan MaaS in Singapore region. Data sent to inference is minimised — we send text snippets, not full guest records. We do not persist anything on the inference side.
- Data Processing Agreement chain: customer (controller) → Roomard (processor) → Baidu AI Cloud (sub-processor) under Standard Contractual Clauses (SCCs) per EU adequacy framework.

**What we tell buyers honestly:** Inference transit to Singapore is contractually controlled and data-minimised; sensitive PII storage is EU-resident. If the buyer cannot accept the inference transit at all, we have an on-prem deployment option at the Enterprise tier (Qianfan models deployable to customer-managed infrastructure).

### 16.2 ERNIE English performance on UK hospitality vocabulary

**The issue:** ERNIE 4.5 and X1 are strongest in Mandarin Chinese. English performance is competent but not category-leading. Hospitality vocabulary includes Britishisms ("cuppa", "ensuite", "lift", "ground floor", regional pub-food references) and international name handling that needs validation.

**The design:**
- Pre-launch benchmark on a curated corpus: 500 real UK hotel review comments + 200 handwritten UK check-in card scans + 100 concierge email threads. Measure precision, recall, and F1 on entity extraction and sentiment scoring.
- If benchmark falls below threshold (target: F1 > 0.85 on entity extraction, sentiment accuracy > 0.80), route specific tasks to higher-precision approaches: in-house fine-tuning via Qianfan, ensemble with a second model also accessed via Qianfan, or — last resort — a specific task-level swap to a different model that's still accessible inside our overall stack.
- Build the multi-agent orchestration in MeDo such that any single agent can be swapped without rewriting the system. Abstraction is the insurance policy.

**What we tell buyers honestly:** We benchmark monthly on UK content. Our quality metrics are published in the customer dashboard. The buyer sees the confidence scores; they are not asked to take quality on faith.

### 16.3 PMS integration partnership friction

**The issue:** Mews, Opera Cloud, Cloudbeds, Apaleo each operate partner programs with technical certification and commercial agreements. Without these certifications, we are an unblessed third-party integration that PMS-native customers will not deploy.

**The design:**
- Priority 1: Mews Marketplace listing within 6 months of MVP. Mews is the right strategic bet — modern, API-first, growing fast, mid-tier-aligned.
- Priority 2: Cloudbeds marketplace listing within 9 months.
- Priority 3: Oracle Hospitality OHIP integration within 12 months (Opera Cloud customers are the larger groups).
- Priority 4: Apaleo (newer, API-native, small but strategic) within 12 months.

### 16.4 MeDo platform lock-in

**The issue:** Building the application generation layer on MeDo creates dependency on Baidu's platform availability, pricing changes, and feature roadmap.

**The design:**
- Use MeDo's code-export capability (available on higher tiers) to maintain a fallback. The generated React/TS codebase is owned by Roomard and maintained outside MeDo for the long term — MeDo is the accelerator, not the lock-in.
- All business logic lives in services that are deployable independently of MeDo. MeDo is the scaffold, not the runtime.

---

## 17. Risks and kill scenarios (refined)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GDPR enforcement action against Baidu transit | Low | Catastrophic | Designed-in EU residency; SCC chain; on-prem option for the most stringent buyers |
| ERNIE English fails benchmark below acceptable threshold | Medium | High | Pre-launch benchmark; multi-agent abstraction allows task-level model swaps within Qianfan |
| Canary Technologies ships arrival brief at parity within 6 months | Medium-high | High | Speed-to-market; Mews partnership lock-in; multimodal depth (paper + voice) that Canary's screen-first product is not architected for |
| PMS vendor (Mews, Cloudbeds) ships native parity | Medium | High | Partner before competing; design Roomard as the layer they cannot ship — cross-property identity, paper/voice ingestion, external review linkage |
| Large hotel chain builds in-house | Low | Medium | Not our market — sell to mid-tier and HMCs |
| Buyer objection: "we'll just use ChatGPT / Gemini" | High | Medium | Demo on their data; demonstrate the integration, audit, and procurement readiness gap |
| "Train the staff better" buyer objection | Medium | Low | 62% turnover destroys training; Roomard preserves memory beyond staff tenure |
| MeDo platform outage or pricing change | Low | Medium | Code-export fallback; business logic independent of MeDo scaffold |
| Inference cost rises faster than pricing | Low-medium | Medium | Token-efficient prompt engineering; cache per-guest synthesis where possible; reasoning tier (X1) used selectively |
| Privacy backlash about "AI watching guests" | Medium | High | Guest privacy panel from day one; transparent retention; published DPA; do not market as surveillance |

---

## 18. Open questions to resolve before sprint 1

These are the unresolved questions that need to be closed before development begins. They affect architecture, scope, or commercial positioning.

| ID | Question | Owner | Resolution by |
|---|---|---|---|
| Q-01 | Is the flagship pilot PMS Mews, Cloudbeds, or Opera Cloud? | Senthil | Pre-sprint 1 |
| Q-02 | Mobile Phase 1 — confirm PWA over React Native | Senthil | Pre-sprint 1 |
| Q-03 | EU storage: Baidu BOS EU edge (if available) or AWS S3 Frankfurt as the documented exception? | Senthil | Pre-sprint 1 |
| Q-04 | Brand visual identity — when does design work start? Parallel to engineering or after MVP? | Senthil | Sprint 2 |
| Q-05 | First customer profile: independent boutique (faster sign), regional group (better proof), or HMC (highest leverage)? | Senthil | Sprint 4 (when sales conversations begin) |
| Q-06 | Pilot pricing — full price, discounted, or free for first 3 customers? | Senthil | Sprint 5 |
| Q-07 | Voice memo language support — UK English only, or include hospitality-common languages (Spanish, French, German, Mandarin, Arabic) in MVP? | Senthil | Pre-sprint 1 |
| Q-08 | Data Privacy Officer (DPO) — internal hire or external fractional service for first 18 months? | Senthil | Month 3 |

---

## 19. Success metrics (what we measure)

### 19.1 Product metrics

| Metric | MVP target | Year-1 target |
|---|---|---|
| Daily active users per property | 3+ roles | 6+ roles |
| Briefs generated per property per week | 50+ | 200+ |
| Brief acceptance rate (user actions on brief) | 60% | 80% |
| OCR confidence average | > 0.80 | > 0.88 |
| Cross-source synthesis confidence average | > 0.75 | > 0.85 |
| Cross-property identity resolution precision | > 0.90 | > 0.95 |
| Exception queue resolution time (median) | < 48h | < 12h |

### 19.2 Commercial metrics

| Metric | 6-month target | 12-month target | 18-month target |
|---|---|---|---|
| Paying customers | 5 | 20 | 50 |
| ARR | £150k | £700k | £2.6M |
| Mews certified status | In progress | Certified | Listed on marketplace |
| First case study published | Yes | Yes | 3+ |
| SOC 2 Type I | In progress | Achieved | — |

### 19.3 Customer metrics (the proof)

| Metric | Reference customer target |
|---|---|
| Lift in direct repeat-booking rate (annualised) | +4–8 percentage points |
| Reduction in OTA commission spend (annualised, attributed) | 15–25% |
| Reduction in time spent on arrival briefing per FD Manager per day | 60–80% |
| NPS from front-desk staff (Roomard as a tool) | 50+ |

---

## 20. What this document does *not* cover (out of scope here)

This BRD is intentionally scoped. The following are deferred to their dedicated documents (delivered next in sequence):

| Topic | Deferred to |
|---|---|
| Granular use case specifications (UC-01 to UC-30, full detail) | Use Case Catalogue (next document) |
| Use case flow diagrams (swimlanes per UC) | Use Case Flow Diagrams document |
| User stories (INVEST format, sprint-allocated) | User Story Backlog |
| Technical architecture (services, data flows, deployment topology) | Solution Architecture Document |
| Data model and ERD | Data Model & ERD |
| API contracts | API Contract Specification |
| Live traceability matrix (Requirement → UC → Story → Component → Test) | Traceability Matrix |
| Test strategy and test cases | Test Strategy & Test Case Skeleton |
| Sprint sequencing (sprints 1–24) | Sprint Plan |

---

## 21. Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 14 May 2026 | Claude | Hackathon BRD (`03_Roomard_Lifestyle_Game.md`) |
| 2.0 | 18 May 2026 | Senthil with Claude | Enterprise-grade BRD with web+mobile mandate, granular use case catalogue framing, deeper unit economics, GTM, defensibility thesis, constraint implications surfaced |

---

*End of Roomard BRD v2.0 — 18 May 2026 — Foundation document for the document set that follows.*
