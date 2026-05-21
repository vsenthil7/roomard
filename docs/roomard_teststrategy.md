# Roomard — Test Strategy & Test Case Skeleton v1.0

**Test strategy across functional, non-functional, AI-quality, security, and compliance dimensions. Test case skeleton for every MVP acceptance criterion.**

| Field | Value |
|---|---|
| Document | Roomard Test Strategy & Test Case Skeleton v1.0 |
| Date | 18 May 2026 |
| Companion to | All prior documents in the Roomard set; specifically closes GAP-001 in the Traceability Matrix |
| Audience | QA Lead, engineers, security reviewer, compliance reviewer |
| Scope | Strategy across all dimensions; test case skeleton for MVP acceptance criteria (41 ACs → ~92 test cases) |

---

## 0. Document map

| Section | Purpose |
|---|---|
| 1 | Testing principles |
| 2 | Test pyramid and category mix |
| 3 | Functional test strategy |
| 4 | Non-functional test strategy (performance, reliability) |
| 5 | AI-quality test strategy |
| 6 | UK English benchmark methodology |
| 7 | Security test strategy |
| 8 | Compliance test strategy |
| 9 | Test environments and data |
| 10 | Defect management |
| 11 | Test case skeleton — MVP acceptance criteria → test cases |
| 12 | Cross-cutting test categories |
| 13 | Test automation and CI integration |
| 14 | Open testing questions |

---

## 1. Testing principles

These principles govern every testing decision. Deviations require explicit reasoning.

| # | Principle | Why |
|---|---|---|
| T1 | **Tests fail loudly, not silently.** Skipped tests are tracked, not hidden. | A skipped test is an open question, not a closed one. |
| T2 | **Tests verify behaviour, not implementation.** Refactoring should not require rewriting tests. | Implementation churn happens; behaviour stability is the contract. |
| T3 | **Tests are deterministic.** Flaky tests are quarantined and fixed, never re-run-until-green. | Flakes erode trust faster than failures. |
| T4 | **AI outputs are tested against benchmarks, not exact-match.** Outputs are stochastic; quality is statistical. | Exact-match assertions on LLM outputs are brittle and meaningless. |
| T5 | **Production data is never used in test environments.** Synthetic data only, with realistic structure. | GDPR; reproducibility; isolation. |
| T6 | **Coverage targets are calibrated per layer.** 100% unit coverage is not a goal; meaningful coverage is. | Coverage as a number is a vanity metric; coverage as quality signal is real. |
| T7 | **Security and compliance tests run in CI on every commit.** They are not periodic audits. | Drift between audits is where breaches happen. |
| T8 | **Acceptance criteria are testable. If a criterion is not testable, it is not a criterion.** | Untestable ACs hide ambiguity. |
| T9 | **Tests document behaviour.** A reader of the test suite should be able to learn the product. | Tests are the most reliable specification. |
| T10 | **Tests reflect real user scenarios, not implementation conveniences.** | Tests that mirror code structure miss user-experienced bugs. |

---

## 2. Test pyramid and category mix

### 2.1 The pyramid

```
                  ╱╲
                 ╱E2╲                ← End-to-end (~50)
                ╱────╲
               ╱ Cont ╲               ← Contract / integration (~200)
              ╱────────╲
             ╱  Service  ╲            ← Service-level (~600)
            ╱────────────╲
           ╱     Unit     ╲           ← Unit (~2000+)
          ╱──────────────────╲
         ╱   AI-quality eval  ╲      ← Separate axis, runs alongside
        ╱────────────────────╲
```

Indicative test count at MVP. Numbers grow with V2.

### 2.2 Category responsibilities

| Layer | What it tests | Tooling | Runtime budget |
|---|---|---|---|
| **Unit** | Pure functions, data transforms, validation logic | Native test framework per language | < 30 seconds full suite |
| **Service** | Single service in isolation (DB included, external deps mocked) | Service-specific harness + Testcontainers for DB | < 5 minutes |
| **Contract / integration** | Inter-service boundaries; API contracts; webhook handling | Pact or schemathesis for API contracts; integration harness | < 10 minutes |
| **End-to-end** | Full user journeys across surfaces | Playwright (web), Detox or equivalent (mobile) | < 15 minutes |
| **AI-quality eval** | Statistical quality of inference outputs against benchmarks | Custom harness with versioned datasets | Run on prompt change + nightly |

### 2.3 What goes where — decision rules

- **Logic involving only data → unit.** Field validation, polarity inference from text patterns, confidence-band classification.
- **Logic involving the database or a single service → service-level.** Repository methods, event handlers, scheduled-job logic.
- **Logic crossing service boundaries → contract / integration.** PMS sync flow, brief generation triggering distribution.
- **Logic crossing user surfaces → end-to-end.** "Agent captures card on mobile, then Concierge reviews exception on web, then guest profile shows the saved preference."
- **AI behaviour → AI-quality eval, separately.**

### 2.4 What this means for MVP

| Category | MVP target |
|---|---|
| Unit tests | ~800 (grows with stories) |
| Service tests | ~250 |
| Contract / integration tests | ~80 |
| End-to-end tests | ~25 (one per MVP UC, plus key permutations) |
| AI-quality benchmarks | 4 (OCR, entity extraction, sentiment, identity matching) |

---

## 3. Functional test strategy

### 3.1 Functional test scope per UC

Every MVP UC produces test cases in this pattern:

| Test class | Purpose |
|---|---|
| **Happy path** | Main flow as documented in Use Case Catalogue passes end-to-end |
| **Alternate flows** | Each named alternate flow (A1, A2, …) exercised |
| **Acceptance criteria** | Each AC has at least one test (usually two: positive + negative) |
| **Boundary conditions** | Just-inside / just-outside thresholds (e.g., confidence 0.84 vs 0.86 for UC-01 exception routing) |
| **Permission gates** | Roles without permission are denied at the right layer |
| **Tenant isolation** | Cross-tenant access attempts are rejected by RLS |

### 3.2 Functional test ownership

Test cases authored by the engineer who implements the story, reviewed by the QA Lead, automated as part of the story's Definition of Done.

### 3.3 Definition of Done — testing dimension

A story is not "done" until:
- All ACs have corresponding automated tests, passing
- New code has unit test coverage on the meaningful paths (no specific percentage target)
- If the story touches a UC's main flow, the UC's end-to-end test passes
- If the story touches an API contract, the contract test passes
- If the story touches an AI prompt, the relevant AI benchmark runs and meets threshold

---

## 4. Non-functional test strategy

### 4.1 Performance

| Metric | Target | Test approach |
|---|---|---|
| API Gateway p99 latency | < 800ms for reads, < 2s for writes | Synthetic load via k6, run nightly |
| Guest lookup p99 (UC-08) | < 1.5s on 4G simulation | Throttled-network E2E test |
| Card OCR pipeline p99 | < 8s | Service-level test with real OCR endpoint |
| Brief generation per property | < 5 min from trigger | Scheduled-job test |
| Web initial load (cold) | < 3s on 4G simulation | Lighthouse CI + WebPageTest |
| Mobile PWA initial load | < 4s on 3G simulation | Lighthouse CI |

### 4.2 Load

| Scenario | Load | Pass criteria |
|---|---|---|
| Normal day | 600 concurrent users, 6,000 req/min | All SLOs met |
| Brief generation morning burst | 50 properties × ~30 arrivals each in 30 min window | All briefs delivered by 06:30 local |
| Review polling burst | 1,200 properties × 4 platforms polled within 10 min | No platform rate limit exceeded |
| Card capture surge | 100 captures/min sustained for 10 min | OCR latency p99 < 10s (degraded but acceptable) |

Load tests run weekly on staging using a tenant-scoped synthetic dataset.

### 4.3 Reliability

| Scenario | Test |
|---|---|
| PMS webhook delivery failure | Webhook delivery dropped; reconciliation catches within 1 hour |
| Inference endpoint timeout | AI Gateway times out gracefully, capture goes to exception queue |
| Database failover | Read traffic resumes within 30s of primary failover |
| Network partition between EU and Singapore inference | Capture pipeline gracefully degrades; queued retries succeed within 5 min of recovery |
| Cache cold start | First requests after deploy do not exceed p99 + 50% |

Chaos engineering exercises run monthly on staging (e.g., kill a random pod, drop network packets to inference region).

### 4.4 Scale validation

Before Year-1 capacity targets are exceeded, run a synthetic test at 2× target load. Document any degradation. This is the "we can grow without re-architecting" evidence.

---

## 5. AI-quality test strategy

This is the section that doesn't exist in conventional QA strategies and where Roomard's quality bar is most easily missed.

### 5.1 Why AI testing is its own category

LLM outputs are stochastic. Two runs of the same prompt on the same input can produce different text. Exact-match assertions break. The right testing approach is **statistical quality measurement against versioned benchmarks**, not behavioural assertions.

### 5.2 The four MVP benchmarks

| Benchmark | What it measures | Dataset size | Frequency | Pass threshold |
|---|---|---|---|---|
| **OCR (UK handwriting)** | PaddleOCR-VL extraction accuracy on real UK check-in cards | 200 cards (labelled) | On prompt change + nightly | Per-field precision ≥ 0.85, recall ≥ 0.80 |
| **Entity extraction (English hospitality)** | ERNIE 4.5 entity extraction (name, room, preference, dietary) from OCR output | 500 OCR snippets (labelled) | On prompt change + nightly | F1 ≥ 0.85 per entity type |
| **Sentiment (UK English hospitality reviews)** | ERNIE 4.5 sentiment polarity and topic tagging | 500 reviews (labelled) | On prompt change + weekly | Polarity accuracy ≥ 0.80; topic precision ≥ 0.75 |
| **Identity matching** | ERNIE X1 cross-property identity resolution | 300 candidate pairs (labelled, 50/50 match/no-match) | On prompt change + weekly | Precision ≥ 0.95 at high-confidence threshold; recall ≥ 0.80 |

### 5.3 Benchmark dataset properties

- **Labelled by humans.** Two-rater agreement required; disagreements adjudicated by a third.
- **Versioned.** Every dataset has a version. When the dataset changes, benchmark scores reset.
- **Stratified.** Includes diverse handwriting styles, name origins (UK, EU, Indian, Chinese, Arabic), accent variants in reviews, edge cases (very brief, very long, mixed languages).
- **Held out from any training/fine-tuning.** Strict separation.

### 5.4 Benchmark execution

Each benchmark is a script that:
1. Loads the dataset version
2. Runs each item through the current active prompt
3. Computes metrics (precision, recall, F1, accuracy)
4. Compares against the threshold
5. Compares against the previous run (regression detection)
6. Emits a report to `/benchmarks/results/`

CI fails if any benchmark drops below threshold. Prompt changes that improve one metric but regress another require explicit approval.

### 5.5 Prompt version testing

Every prompt has a benchmark score stored with its `prompt_version` record (see Data Model §11.2). Promotion gate: a prompt cannot move from `draft` to `active` without passing all relevant benchmarks at the documented threshold.

### 5.6 What this catches that conventional testing doesn't

- **Silent regression.** A prompt tweak that improves UC-07 brief quality but drops UC-08 lookup precision.
- **Locale drift.** Model update from Qianfan changes English performance; benchmark catches it before customers do.
- **Confidence calibration drift.** Confidence scores systematically biased high or low; comparison against ground-truth catches it.

### 5.7 Where AI testing meets human review

Some quality dimensions can't be benchmarked numerically. For these, **structured human review** runs alongside the benchmarks:

| Quality dimension | Review approach |
|---|---|
| Narrative summary readability (UC-12, UC-07) | Monthly random sample of 30 summaries reviewed by Product on a 5-point rubric |
| "Say this" suggestion appropriateness (UC-08) | Monthly random sample of 50 suggestions reviewed for tone, accuracy, hospitality-appropriateness |
| Exception queue suggestion usefulness (UC-23) | Track approve/edit/reject ratios; investigate when edit rate exceeds 30% |

---

## 6. UK English benchmark methodology

A dedicated section because BRD §16.2 calls this out as a real risk and Architecture §5.5 designed around it.

### 6.1 Why UK English specifically

ERNIE models are strongest in Mandarin. English performance is competent but uncalibrated for UK hospitality vocabulary specifically. The mid-tier UK hospitality market is Roomard's primary entry point. Underperformance on UK-specific language fails the product before it ships.

### 6.2 The UK-specific test corpus

| Corpus | Size target | Sources |
|---|---|---|
| UK handwritten check-in cards | 200 cards | Partner pilot hotels, anonymised; manual scan + label |
| UK hotel reviews | 500 reviews | TripAdvisor / Booking.com public data, scraped and labelled by review platform terms |
| UK concierge email threads | 100 threads | Pilot customer with consent, anonymised |
| UK hospitality terms gazetteer | ~400 terms | Hand-curated: cuppa, ensuite, lift, ground floor, kettle in room, breakfast butty, full English, half board, room only, en-suite, double room, twin room, family room, etc. |

### 6.3 Pre-Sprint-3 corpus acquisition

This is on the critical path. Per Architecture AQ-05, corpus acquisition needs to be in flight by Sprint 0. The benchmark cannot be retroactively built — it must exist before Sprint 3 (when card capture pipeline ships) or the pipeline ships against an untested model.

### 6.4 Benchmark gate before pilot

Before the first pilot customer goes live (Sprint 11/12), all four AI benchmarks must pass on the UK corpus, not on a generic English corpus. Failing to gate on this risks a customer-visible quality failure in week one.

### 6.5 What we do if benchmarks fail

Per Architecture §5.2, the AI Gateway abstraction allows task-level model swaps within Qianfan. If a specific benchmark fails:

1. Try alternative Qianfan model for that task (ERNIE 4.5 → ERNIE X1, or vice versa)
2. Try prompt engineering iterations (more examples, clearer instructions, output format constraints)
3. If still failing: customer-facing impact assessment, decide whether to ship with the limitation or delay
4. **Never:** ship the product hoping the customer won't notice

---

## 7. Security test strategy

### 7.1 Test categories

| Category | What it tests | Cadence |
|---|---|---|
| **Authentication tests** | Valid tokens accepted; invalid/expired/forged rejected | Every commit (unit + service) |
| **Authorisation tests** | Every endpoint denies access without the required role; permission denials are audit-logged | Every commit |
| **Tenant isolation tests** | Cross-tenant access attempts blocked at API, service, and DB layers | Every commit |
| **Input validation tests** | Malformed input, oversized payloads, injection patterns rejected safely | Every commit |
| **Secrets management tests** | No secrets in code; secrets manager integration works; key rotation works | Sprint cycle |
| **Encryption tests** | Data at rest encrypted; TLS 1.3 enforced; per-tenant keys correctly derived | Sprint cycle |
| **SAST** | Static analysis for common vulnerabilities | Every PR |
| **SCA** | Software composition analysis for known CVEs in dependencies | Daily |
| **DAST** | Dynamic analysis on staging | Weekly |
| **Penetration test** | Third-party manual + automated | Pre-MVP + annually |

### 7.2 Permission test pattern

For every API endpoint, generate tests of the form:

```
For each (endpoint, role) pair:
  - Given a user with this role
  - When they call this endpoint
  - Then they receive (200/201/204 if permitted) OR (403 forbidden) as documented in the permission matrix
  - And if 403, an audit_events row with outcome='denied' exists
```

This generates ~1000 permission tests at MVP scope (40 endpoints × ~12 roles + matrix exceptions). Automated generation; not hand-authored.

### 7.3 Tenant isolation test pattern

For each tenant-data table and each tenant-data endpoint:

```
- Given Tenant A and Tenant B with overlapping data IDs
- When a user in Tenant A queries an ID belonging to Tenant B
- Then they receive 404 not_found (never 200 with another tenant's data, never 403 leaking existence)
- And RLS policy logs no row visibility
- And no record of the cross-tenant resource appears in caller's response
```

### 7.4 Audit log integrity tests

| Test | What it verifies |
|---|---|
| Insert-only | Attempts to UPDATE or DELETE on `audit_events` are blocked |
| Hash chain integrity | Tamper-evidence: modifying a row breaks the next row's hash verification |
| No-redact | PII redaction in audit payload does not break the hash chain |
| Tenant scope | Audit events from Tenant A invisible to Tenant B's DPO |

---

## 8. Compliance test strategy

### 8.1 GDPR

| Right (GDPR) | Test |
|---|---|
| Art 15 — Access | DPO generates export pack for a subject; pack contains 100% of subject data; pack is human-readable |
| Art 16 — Rectification | Preference correction via UC-14 propagates within 1 minute; audit log entry created |
| Art 17 — Erasure | RTBF purge via UC-19 removes data across all stores within 30 days; verification report shows 0 residual records |
| Art 18 — Restriction | Processing restriction flag honoured by all consuming services within 5 minutes |
| Art 20 — Portability | Export pack is machine-readable (JSON + signed PDF index) |
| Art 21 — Objection | Tenant-level processing-category disable flag honoured |

### 8.2 Data residency tests

| Test | What it verifies |
|---|---|
| Class A PII storage region | A direct query of guest PII storage location returns EU region only |
| Inference payload minimisation | A test inference call is recorded; the payload contains only the task-required text, no surrounding context |
| Cross-region transit log | Every inference call's payload size and content category is logged for audit |
| On-prem mode (Enterprise tier) | When a tenant is configured for on-prem inference, no payload leaves the tenant boundary |

### 8.3 Audit pack export tests

A SOC 2 auditor scenario:

```
- Given a 30-day window for a specific property
- When DPO exports the audit pack
- Then the pack contains: all data access events, all data modification events, all AI calls, all permission denials
- And the pack is cryptographically signed
- And the signature is verifiable by an external auditor with the published public key
- And generation completes within 60 seconds for the specified scope
```

### 8.4 Compliance test execution

Compliance tests run in CI on every commit. Failure blocks merge. This is deliberately strict — compliance regressions caught at PR are 100× cheaper than caught in an audit.

---

## 9. Test environments and data

### 9.1 Environment matrix

| Environment | Purpose | Data | Inference |
|---|---|---|---|
| `dev` (local) | Engineer workstation | Synthetic seed (small, deterministic) | Qianfan dev endpoints with quota |
| `dev-ephemeral` (per-PR) | PR preview | Synthetic seed | Qianfan dev endpoints |
| `staging` | Pre-prod integration | Synthetic data at production scale | Qianfan staging endpoints |
| `pilot` | First customer pilots | Real customer data | Qianfan prod endpoints |
| `prod` | Production | Real customer data | Qianfan prod endpoints |

### 9.2 Synthetic data generation

A `seed` tool generates:
- 50 tenants of varying tier
- 1,200 properties across the tenants
- 50,000 guests with realistic name distributions (UK, EU, US, Indian, Chinese, Arabic name corpora)
- 200,000 stays spanning 3 years
- 500,000 preferences across the guests
- 30,000 reviews from synthetic-but-realistic sources
- 8,000 staff users across roles

The seed tool is deterministic by seed value; same seed → same dataset. This is what enables reproducible benchmarks.

### 9.3 Production data — explicitly excluded

Per principle T5, production data is never used in test environments. Even in pilot, customer data is segregated to a single tenant; cross-tenant test traffic does not touch pilot data.

### 9.4 Test data refresh

| Environment | Refresh cadence |
|---|---|
| `dev`, `dev-ephemeral` | On engineer command |
| `staging` | Nightly full reset |
| `pilot` | Never refreshed; live data only |
| `prod` | Never refreshed |

---

## 10. Defect management

### 10.1 Severity definitions

| Severity | Definition | SLA |
|---|---|---|
| **S0 — Critical** | Data loss, security breach, full outage, GDPR violation | Engineering halts until resolved; same-day fix |
| **S1 — High** | Major feature broken; SLO breach; significant data quality issue | Fix within 1 sprint |
| **S2 — Medium** | Feature partially broken; workaround exists; minor data quality issue | Fix within 3 sprints |
| **S3 — Low** | Cosmetic; non-blocking; edge case | Fix when prioritised |

### 10.2 Defect lifecycle

`reported` → `triaged` → `in-progress` → `in-review` → `verified` → `closed`. Defects with status `in-progress` longer than the SLA escalate automatically.

### 10.3 Defect quality metrics

Tracked weekly:
- New defects per week (by severity)
- Defects closed per week
- Defect age distribution
- Escape rate (defects found in pilot/prod that should have been caught earlier)

---

## 11. Test case skeleton — MVP acceptance criteria

Every MVP acceptance criterion is mapped here to one or more test cases. The skeleton shows the ID structure; actual test code is written by engineers during story implementation.

Pattern: `TC-[UC]-[N]` is the test case ID. Each TC links to one or more ACs.

### 11.1 UC-01 Card capture

| AC | Description | Test cases |
|---|---|---|
| AC-01.1 | Capture-to-saved-profile ≤ 8s | TC-01-1 (happy path latency on 5Mbps), TC-01-2 (degraded network) |
| AC-01.2 | OCR confidence ≥ 0.80 on UK benchmark | TC-01-3 (benchmark execution), TC-01-4 (regression detection) |
| AC-01.3 | Low-confidence routes to exception queue | TC-01-5 (positive: confidence 0.80 routes), TC-01-6 (negative: confidence 0.90 auto-saves) |
| AC-01.4 | Offline capture, sync on reconnect | TC-01-7 (offline-queue-sync), TC-01-8 (offline limit at 50 items) |
| AC-01.5 | Audit log entry contains required fields | TC-01-9 (audit log shape) |
| AC-01.6 | Guest profile shows source attribution | TC-01-10 (source attribution display) |

### 11.2 UC-05a Review ingestion

| AC | Description | Test cases |
|---|---|---|
| AC-05a.1 | New reviews appear within 3h | TC-05a-1 (poll + ingest latency) |
| AC-05a.2 | Sentiment accuracy ≥ 0.80 on UK benchmark | TC-05a-2 (benchmark), TC-05a-3 (regression) |
| AC-05a.3 | All ingested reviews visible on web console | TC-05a-4 (display completeness) |

### 11.3 UC-05b Review linking

| AC | Description | Test cases |
|---|---|---|
| AC-05b.1 | Identity match precision ≥ 0.90 on benchmark | TC-05b-1 (benchmark) |
| AC-05b.2 | Auto-linked reviews appear within 5 min | TC-05b-2 (linking latency) |
| AC-05b.3 | Manager can manually link | TC-05b-3 (manual link flow), TC-05b-4 (unlink) |

### 11.4 UC-07a Brief generation

| AC | Description | Test cases |
|---|---|---|
| AC-07a.1 | Brief ready by 06:30 local per property | TC-07a-1 (timing across timezones), TC-07a-2 (50-property fan-out) |
| AC-07a.2 | Every arrival included; priority ≤ 8 | TC-07a-3 (completeness), TC-07a-4 (priority cap) |
| AC-07a.3 | Each brief item has source attribution | TC-07a-5 (source attribution) |
| AC-07a.4 | Brief regenerated if arrivals change pre-11:00 | TC-07a-6 (regeneration trigger), TC-07a-7 (post-11:00 no-op) |

### 11.5 UC-07b Brief distribution

| AC | Description | Test cases |
|---|---|---|
| AC-07b.1 | Brief accessible on web and mobile by 06:30 | TC-07b-1 (web access timing), TC-07b-2 (mobile access timing) |
| AC-07b.2 | One-tap drilldown to evidence | TC-07b-3 (web drilldown), TC-07b-4 (mobile drilldown) |
| AC-07b.3 | "Briefed to team" status persists, reportable | TC-07b-5 (persistence), TC-07b-6 (cross-surface sync) |
| AC-07b.4 | Push notification ≥ 95% reliability | TC-07b-7 (push reliability sampling) |

### 11.6 UC-08 Guest lookup

| AC | Description | Test cases |
|---|---|---|
| AC-08.1 | Lookup-to-display ≤ 1.5s on mobile | TC-08-1 (p99 latency), TC-08-2 (4G network simulation) |
| AC-08.2 | Top 3 contains target ≥ 95% on benchmark | TC-08-3 (ranking benchmark) |
| AC-08.3 | "Say this" suggestion appropriate ≥ 80% | TC-08-4 (suggestion review benchmark) |
| AC-08.4 | Audit log records every lookup | TC-08-5 (audit log per lookup) |

### 11.7 UC-09 Housekeeping prep

| AC | Description | Test cases |
|---|---|---|
| AC-09.1 | Prep cards generated by 18:30 D-1 | TC-09-1 (generation timing), TC-09-2 (multi-property fan-out) |
| AC-09.2 | Late bookings generate card within 15 min | TC-09-3 (late-booking responsiveness) |
| AC-09.3 | Mark complete in ≤ 3 taps | TC-09-4 (tap-count regression test) |
| AC-09.4 | Supervisor sees real-time status | TC-09-5 (status sync latency) |

### 11.8 UC-23 Exception queue

| AC | Description | Test cases |
|---|---|---|
| AC-23.1 | Queue loads ≤ 2s for 200 items | TC-23-1 (load performance) |
| AC-23.2 | Median resolution time ≤ 30s | TC-23-2 (resolution time tracking) |
| AC-23.3 | Approve/edit/reject is one tap | TC-23-3 (interaction patterns) |
| AC-23.4 | Resolutions logged as training signal | TC-23-4 (training-signal log shape) |

### 11.9 UC-24a PMS inbound

| AC | Description | Test cases |
|---|---|---|
| AC-24a.1 | Events propagate within 30s | TC-24a-1 (webhook-to-store latency) |
| AC-24a.2 | All Mews event types supported | TC-24a-2 (event-type matrix coverage) |
| AC-24a.3 | Hourly reconciliation catches missed events | TC-24a-3 (reconciliation correctness) |

### 11.10 UC-25 Review polling

| AC | Description | Test cases |
|---|---|---|
| AC-25.1 | Poll runs every 2h reliably | TC-25-1 (scheduler reliability) |
| AC-25.2 | Rate-limit handling with backoff | TC-25-2 (rate-limit recovery) |
| AC-25.3 | Connection health on status page | TC-25-3 (status accuracy) |

### 11.11 UC-29 SSO

| AC | Description | Test cases |
|---|---|---|
| AC-29.1 | Supports Entra, Okta, Google | TC-29-1 (Entra SAML), TC-29-2 (Okta SAML), TC-29-3 (Google OIDC) |
| AC-29.2 | SAML 2.0 and OIDC both supported | TC-29-4 (protocol switch test) |
| AC-29.3 | Setup ≤ 30 min for typical IdP | TC-29-5 (setup time measurement, human in loop) |

### 11.12 Test case count summary

| UC | ACs | TCs |
|---|---|---|
| UC-01 | 6 | 10 |
| UC-05a | 3 | 4 |
| UC-05b | 3 | 4 |
| UC-07a | 4 | 7 |
| UC-07b | 4 | 7 |
| UC-08 | 4 | 5 |
| UC-09 | 4 | 5 |
| UC-23 | 4 | 4 |
| UC-24a | 3 | 3 |
| UC-25 | 3 | 3 |
| UC-29 | 3 | 5 |
| **MVP total** | **41** | **57** |

The traceability matrix coverage commitment was ~82 TCs. The 57 above are the **AC-direct** test cases; cross-cutting tests (§12) bring the total to ~90.

---

## 12. Cross-cutting test categories

Tests not bound to a single UC.

### 12.1 TC-CROSS-tenancy

Every API endpoint and every database table tested for cross-tenant isolation. Generated automatically — one test per (endpoint, role-pair) and per (table, tenant-pair). ~35 tests.

### 12.2 TC-CROSS-rbac

Every API endpoint tested against every role for correct permit/deny behaviour. ~40 tests.

### 12.3 TC-CROSS-audit

Every write operation tested for correct audit_events row creation. ~25 tests.

### 12.4 TC-CROSS-residency

| Test | Verifies |
|---|---|
| TC-CROSS-residency-1 | Direct Postgres query confirms Class A PII storage is EU-resident |
| TC-CROSS-residency-2 | Object store bucket region is EU |
| TC-CROSS-residency-3 | Inference call payload contains only task-required fields |
| TC-CROSS-residency-4 | No inference response is persisted in inference region |

### 12.5 TC-CROSS-idempotency

| Test | Verifies |
|---|---|
| TC-CROSS-idempotency-1 | Same Idempotency-Key returns same response on retry |
| TC-CROSS-idempotency-2 | Webhook handler safe to receive same event twice |
| TC-CROSS-idempotency-3 | Scheduled job re-runs do not duplicate state |

### 12.6 Cross-cutting test count

| Category | Tests |
|---|---|
| TC-CROSS-tenancy | ~35 |
| TC-CROSS-rbac | ~40 |
| TC-CROSS-audit | ~25 |
| TC-CROSS-residency | 4 |
| TC-CROSS-idempotency | 3 |
| **Total cross-cutting** | **~107** |

Adding to direct UC tests: **~164 explicit tests for MVP**, supplemented by ~800 unit tests, ~250 service tests, ~80 contract tests, ~25 E2E tests.

---

## 13. Test automation and CI integration

### 13.1 CI pipeline integration

```
On every commit:
  - Unit tests (target: <30s)
  - Service tests (target: <5min)
  - Contract tests (target: <10min)
  - SAST + SCA
  - Permission tests (auto-generated)
  - Tenancy isolation tests (auto-generated)
  - Audit-trail tests

On every PR:
  - All of the above
  - Lighthouse CI (web)
  - PWA audit (mobile)
  - DAST on PR preview env

Nightly on staging:
  - Full E2E suite
  - All 4 AI-quality benchmarks
  - Performance test suite
  - Lighthouse CI baselines

Weekly on staging:
  - Load test (Year-1 target × 2)
  - DAST full sweep
  - Chaos engineering exercise

Per release candidate:
  - Full regression
  - Security review
  - Compliance test pack
```

### 13.2 Test result publishing

Test results published to a dashboard (e.g., Grafana-backed) showing:
- Pass/fail trend per category
- Flaky test register
- Coverage trend (advisory, not gate)
- AI benchmark scores over time
- Defect age distribution

### 13.3 Test gates that block release

| Gate | Threshold |
|---|---|
| Unit + service + contract tests | 100% passing on the build |
| E2E tests | 100% passing on staging |
| AI benchmarks | All at or above threshold |
| Security tests (SAST + SCA + DAST) | No high/critical findings |
| Compliance tests | 100% passing |
| Performance tests | All SLOs met on staging |
| Manual QA sign-off | For UC-touching changes |

---

## 14. Open testing questions

| ID | Question | Owner | Resolution target |
|---|---|---|---|
| Q-TS-01 | UK corpus acquisition — partnerships with pilot hotels for labelled data | Senthil + Customer Success | Pre-Sprint 0 |
| Q-TS-02 | Cross-rater agreement methodology for benchmark labelling | QA Lead | Sprint 0 |
| Q-TS-03 | Chaos engineering tool: bespoke scripts or LitmusChaos / Gremlin? | Engineering | Sprint 6 |
| Q-TS-04 | Performance testing tool: k6, Locust, or Gatling? | Engineering | Sprint 0 |
| Q-TS-05 | Synthetic data generator: build in-house or use Mockaroo / Synthetic Data Vault? | Engineering | Sprint 0 |
| Q-TS-06 | E2E framework: Playwright only, or mix with Cypress for mobile? | Engineering | Sprint 3 |
| Q-TS-07 | AI benchmark frequency on prod inference: real-time monitoring or sampled? | Engineering + Product | Sprint 8 |
| Q-TS-08 | Threshold for "Say this" suggestion human review — track approve rates and trigger when below 80% | Product | Sprint 6 |

---

## 15. What this document does *not* cover

| Topic | Deferred to |
|---|---|
| Actual test code (this is the skeleton; engineers write the code per story DoD) | Engineering implementation |
| Test data management at scale (post-Year-1) | Future revision |
| Performance regression baseline calibration (needs first production data) | Sprint 12+ |
| Customer-facing reliability reporting (status page, SLA reports) | V2 |
| Sprint sequencing | Sprint Plan (Document 10) |

---

## 16. Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 18 May 2026 | Senthil with Claude | Initial Test Strategy; closes GAP-001 from Traceability Matrix; 41 ACs → 57 direct TCs + ~107 cross-cutting tests |

---

*End of Roomard Test Strategy & Test Case Skeleton v1.0 — 18 May 2026.*

---

## 17. Real-database integration tests — the schema-drift regression layer (added CP-86, 21 May 2026)

### Why this layer exists

The service unit suites drive each handler with a fake `pg` client (`createFakePool`, or a per-test `fakeClient`) that returns whatever rows the test author typed. That is fast and good for asserting routing, auth, error envelopes, and row→DTO mapping — but it has a structural blind spot: **the fake never parses the SQL or checks column names against the real schema.** A query can `SELECT a_column_that_does_not_exist` and the fake will still return a hand-written row, so the unit test passes while the endpoint returns HTTP 500 in production.

That blind spot is not hypothetical. It is exactly how five production bugs shipped green:

| Bug | Service | Drift (code referenced → real column) | Symptom |
|---|---|---|---|
| G-39 | exception | `description`/`resolution_notes` → `detail`/`resolution` | `GET /v1/exceptions` 500 |
| G-40 | web | `res.principal` → `res.user` (the unit test mocked a fictional `principal`) | login silently no-op |
| G-41 | guest | `confidence_calibration`/`source`, `occurred_at`/`title` → `confidence`/`metadata`, `raised_at`/`summary` | preferences, history, trajectory 500 |
| G-42 | tenant | `legal_name`, `address_json` → `name`, discrete address columns | `/v1/tenant`, `/v1/properties` 500 |
| G-43 | capture | `captured_at`, `fields_json` → `occurred_at`, `extracted_fields` | `/v1/captures/:id` 500 |

All five were found by running the product for real (recording the demo against the live stack), never by the unit suite. The integration layer closes that gap: each test runs the **actual exported production code** against a **real Postgres database**, so any column drift raises Postgres error `42703` and the test fails — which the fake-pool tests cannot do.

### What is covered

| File | Guards | Tests | What it runs for real |
|---|---|---|---|
| `services/guest/tests/integration/service-db.test.ts` | G-41 | 4 | `GuestRepo.getPreferences`, `getHistory`, `analyseComplaintTrajectory` against real `preferences`/`stays`/`issues` |
| `services/tenant/tests/integration/server-db.test.ts` | G-42 | 5 | `buildServer()` HTTP routes `/v1/tenant`, `/v1/properties` (list, by-id, insert) via `app.inject()` on a real pool |
| `services/capture/tests/integration/server-db.test.ts` | G-43 | 3 | `buildServer()` HTTP route `GET /v1/captures/:id` (real `evidence`⋈`card_captures`), plus the unknown-id→404 fix |

Each suite also includes a **meta-assertion** that queries `information_schema.columns` to prove the phantom columns genuinely do not exist (and the real ones do) — so the guard demonstrably has teeth and would have failed pre-fix, rather than passing for an unrelated reason. Each `it(...)` description states what it proves and which bug it guards.

### How to run

The integration tests are gated on `DATABASE_URL`. Without it they **skip cleanly** (announced in the output), so the default `pnpm test` / `pnpm -r --filter '!@roomard/web-e2e' run test` stays green with no database. With a live Postgres they run for real:

```
# from the repo root, against the dev container Postgres
set DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard   # Windows
export DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard # *nix
pnpm --filter @roomard/guest-svc exec vitest run tests/integration
pnpm --filter @roomard/tenant-svc exec vitest run tests/integration
pnpm --filter @roomard/capture-svc exec vitest run tests/integration
```

The seeds are idempotent (upsert on fixed ids, or unique per-run values) and run inside `withTenantContext`, so they exercise RLS and the audit trigger exactly as production does and are safe to re-run against the dev DB.

### Note on the workspace test command

`pnpm -r run test` aborts at the first failing package, and `@roomard/web-e2e` (Playwright) requires a running web server, so a bare `pnpm -r run test` fails on that package alone — this is environmental, not a unit-test failure. Run the unit suites with `pnpm -r --filter '!@roomard/web-e2e' run test`; run the e2e suite separately against a started stack.

---

## 18. Document control (continued)

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.1 | 21 May 2026 | Senthil with Claude | Added §17 real-database integration test layer (12 tests across guest/tenant/capture) guarding the G-39..G-43 schema-drift class; documented DATABASE_URL gating and the web-e2e workspace-test caveat. |
