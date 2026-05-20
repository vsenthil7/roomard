# Roomard — Live Traceability Matrix v1.0

**Structured, maintainable traceability from business requirements through use cases, user stories, architecture components, API endpoints, data model entities, and test cases. Designed as a live artefact, not a static table.**

| Field | Value |
|---|---|
| Document | Roomard Live Traceability Matrix v1.0 |
| Date | 18 May 2026 |
| Companion to | All prior documents in the Roomard set |
| Status | Live document — updated on every artefact change per the protocol in §3 |
| Update cadence | Triggered by artefact change; reviewed weekly in sprint planning |
| Owner | Engineering Lead (matrix integrity), Product Owner (requirement linkage) |

---

## 0. Document map

| Section | Purpose |
|---|---|
| 1 | What live traceability means and why it matters |
| 2 | Matrix structure and ID conventions |
| 3 | Update protocol — the rules that keep this current |
| 4 | Tooling and automation |
| 5 | Master traceability table — MVP scope |
| 6 | Coverage analysis — what's traced, what isn't |
| 7 | Gap register |
| 8 | Audit trail |

---

## 1. What live traceability means and why it matters

### 1.1 What "live" means here

A static traceability matrix is a table written once at project start, immediately drifting from reality. By month two it's a fossil — present in the documents repository, ignored by the team, useless in an audit.

A **live** traceability matrix means three things:

1. **Updated whenever an artefact changes.** A new use case, a renamed story, a deprecated endpoint — each triggers a defined matrix update.
2. **Update protocol is a written part of the project.** Not "someone keeps it up to date" but "this person, in this step, with this acceptance gate."
3. **Reviewable.** At any point, anyone on the team can ask "which user stories trace to UC-07 and which test cases cover them?" and get an answer in seconds.

### 1.2 Why this matters for Roomard specifically

Three reasons that aren't generic:

- **Compliance.** UK/EU buyers under GDPR, and eventually SOC 2 audits, will ask "show me how requirement X is implemented and tested." Without live traceability, this is an archaeology project. With it, it's a single query.
- **Change impact.** When the residency model shifts (when Baidu EU region opens, per AQ-01 in Architecture), every component, story, and test affected needs to be identified. Without traceability, this is a guess.
- **Engineering productivity.** When an engineer picks up US-07a-2 and asks "what's the upstream requirement and what test cases must pass," the answer should take 10 seconds, not 30 minutes of document grepping.

### 1.3 What this matrix is not

- **Not a substitute for the documents it links.** The BRD, Use Case Catalogue, Architecture, Data Model, API Spec, Test Strategy each remain authoritative for their respective content. This matrix is the connector tissue.
- **Not auto-magically maintained.** It requires the protocol in §3 to be followed. No protocol = stale matrix.
- **Not a project management tool.** It does not track who is working on what, when something will ship, or how long it took. Those belong in the issue tracker / project board.

---

## 2. Matrix structure and ID conventions

### 2.1 Traced entity types

| Entity type | ID prefix | Owning document |
|---|---|---|
| **Business Requirement** | `BR-` | BRD v2.0 |
| **Use Case** | `UC-` | Use Case Catalogue |
| **User Story** | `US-` | User Story Backlog |
| **Architecture Component** | `ARC-` | Solution Architecture |
| **Data Entity** | `DE-` | Data Model & ERD |
| **API Endpoint** | `API-` | API Contract Specification |
| **Test Case** | `TC-` | Test Strategy (Document 9 — pending) |
| **Acceptance Criterion** | `AC-` | Embedded in Use Case Catalogue |
| **Open Question** | `Q-` | Various |

### 2.2 ID format rules

| Format | Example | Meaning |
|---|---|---|
| `BR-NN` | `BR-01` | Numbered business requirement |
| `UC-NN[-letter]` | `UC-07a` | Use case, optionally split into sub-use-cases |
| `US-UC-N` | `US-07a-1` | Story under a use case; or `US-FND-1`, `US-PLAT-1` for foundation/platform |
| `ARC-NN-Name` | `ARC-05-AIGateway` | Architecture component with descriptive name |
| `DE-Name` | `DE-Preferences` | Data entity by table name |
| `API-Method-Path` | `API-GET-guests-id` | API endpoint |
| `TC-UC-N` | `TC-01-1` | Test case under a use case |
| `AC-UC.N` | `AC-01.3` | Acceptance criterion within a use case |
| `Q-Code-NN` | `Q-API-07` | Open question by domain |

### 2.3 Relationship types

The matrix tracks five relationship types:

| Relationship | Direction | Example |
|---|---|---|
| **implements** | downstream → upstream | US-07a-2 *implements* UC-07a |
| **realises** | downstream → upstream | UC-07a *realises* BR-04 |
| **depends on** | peer → peer | UC-07a *depends on* UC-24a |
| **covers** | downstream → upstream | TC-07a-1 *covers* AC-07a.2 |
| **uses** | resource → resource | UC-07a *uses* ARC-05-AIGateway |

### 2.4 Logical structure

Every traced fact takes the form:

```
[Source ID] [relationship] [Target ID]
```

Examples:
- `US-07a-2 implements UC-07a`
- `UC-07a realises BR-04`
- `UC-07a uses ARC-05-AIGateway`
- `UC-07a uses ARC-07-ERNIE-X1`
- `TC-07a-2 covers AC-07a.2`

This three-part structure is the unit of traceability. The matrix tables in §5 group these facts for readability.

---

## 3. Update protocol — the rules that keep this current

This is the most important section of the document. Without it, the matrix is stale within 4 weeks.

### 3.1 The five trigger events

Any of these triggers a matrix update. The protocol is mandatory, not optional.

| Trigger | What changes | Update owner | Timing |
|---|---|---|---|
| **T1 — New / changed business requirement** | BRD v2.x section change | Product Owner | Before BRD revision is merged |
| **T2 — New / changed use case** | Use Case Catalogue change | Product Owner | Before UC change is merged |
| **T3 — Story added / removed / re-scoped** | User Story Backlog change | Engineering Lead | Before sprint planning closes |
| **T4 — Architecture / data / API change** | Architecture, Data Model, or API Spec change | Engineering Lead | Before the architecture decision is implemented |
| **T5 — Test case added / changed** | Test Strategy or test suite change | QA Lead | Before test PR merges |

### 3.2 Per-trigger update steps

**T1 — New / changed business requirement**
1. Add the new `BR-NN` to BRD v2.x with a unique stable ID
2. In this matrix, add the BR to the master table (§5)
3. Identify which UCs realise the new BR; update the UC-to-BR map
4. If the BR is not realised by any UC, add to the Gap Register (§7)

**T2 — New / changed use case**
1. Add or modify UC in the Use Case Catalogue
2. In this matrix, ensure the UC is in §5 with its BR linkage
3. Verify every UC has at least one realising BR (else it's gold-plating)
4. Add the UC's stories, components, data entities, endpoints, and ACs to the matrix
5. Identify dependent UCs and update the dependency map

**T3 — Story added / removed / re-scoped**
1. Update the User Story Backlog
2. Identify the parent UC (every story must have one)
3. Update the matrix linkages
4. If a story implements an AC, link it explicitly to the AC

**T4 — Architecture / data / API change**
1. Update Architecture, Data Model, or API Spec
2. Identify which UCs use the changed component
3. Update matrix linkages
4. If a UC's behaviour changes as a result, flag in Gap Register for re-test
5. For deprecated components: mark in matrix as `[deprecated]` with sunset date

**T5 — Test case added / changed**
1. Update Test Strategy / test suite
2. Identify the AC and UC the test covers
3. Update matrix linkages
4. If an AC has zero covering test cases, raise to QA Lead — coverage gap

### 3.3 Review cadence

| Cadence | What gets reviewed | By whom |
|---|---|---|
| **At sprint planning (weekly)** | Stories entering the sprint must have a linked UC; UCs in the sprint must have stories | Engineering Lead + Product Owner |
| **At sprint review (weekly)** | Stories completed in the sprint must have linked test cases passing | QA Lead + Engineering Lead |
| **At month end** | Full gap-register review; coverage analysis re-run | All three leads |
| **At quarter end** | External audit-pack mock — run a request as if from a SOC 2 auditor | Compliance officer or DPO |

### 3.4 Single-source-of-truth rule

Where two documents could potentially disagree, the **owning document** wins:

| Topic | Source of truth |
|---|---|
| Business requirement scope | BRD |
| Use case behaviour | Use Case Catalogue |
| Story scope | Story Backlog |
| Component design | Architecture Doc |
| Data structure | Data Model & ERD |
| API contract | API Spec |
| Test acceptance | Test Strategy |

The matrix never overrides any of these. If the matrix and an owning document disagree, the matrix is wrong.

### 3.5 What happens when the protocol is skipped

Skipping is failure mode. Specifically:
- A story enters a sprint without being in the matrix → flagged in sprint planning, blocks the sprint until linked
- An architecture change ships without a matrix update → flagged in the next compliance review, written up as a process gap
- A test passes for a story that the matrix says is incomplete → matrix is updated to reflect reality, but the **why-was-the-gap-there** question is logged

This is not bureaucracy; this is what "live" means. Without enforcement, the matrix becomes the fossil it was meant to replace.

---

## 4. Tooling and automation

### 4.1 Current state (MVP launch)

The matrix is maintained in markdown — this very document. Updates are PRs against the document, reviewed alongside the artefact change that triggered them.

This is deliberately low-tech for the MVP phase because:
- The team is small (4–5 engineers)
- The matrix is reviewable in a glance
- No tooling investment is required

### 4.2 Mid-term automation (Sprint 14+)

Once the matrix grows past ~250 facts, manual maintenance becomes error-prone. The recommended evolution:

| Phase | Tooling | Trigger |
|---|---|---|
| **Phase 1 (now → Sprint 14)** | Markdown + PR review | MVP phase |
| **Phase 2 (Sprint 14–24)** | YAML-backed source files in `/traceability/`, with a script that generates the markdown matrix from YAML | When matrix exceeds ~250 rows |
| **Phase 3 (post-Sprint 24)** | Integration with issue tracker (Linear/Jira); story IDs in commits link automatically | When team exceeds ~10 engineers |

### 4.3 Per-artefact frontmatter convention (Phase 2 preview)

To support Phase 2 automation, every artefact document includes YAML frontmatter:

```yaml
---
id: UC-07a
type: use-case
realises: [BR-04, BR-09]
depends-on: [UC-24a]
uses: [ARC-05-AIGateway, ARC-07-ERNIE-X1]
data-entities: [DE-Briefs, DE-BriefItems, DE-Stays, DE-Guests]
endpoints: [API-POST-briefs-regenerate, API-GET-briefs-today]
stories: [US-07a-1, US-07a-2, US-07a-3, US-07a-4]
acceptance-criteria: [AC-07a.1, AC-07a.2, AC-07a.3, AC-07a.4]
---
```

A simple script then walks frontmatter across all documents and emits the matrix. This is in scope for Sprint 14 only — until then, manual is fine.

### 4.4 Versioning

The matrix is versioned with the same versioning as the rest of the document set. Material changes increment the minor version (1.0 → 1.1 → 1.2). Full re-generations at quarter end increment the major version.

---

## 5. Master traceability table — MVP scope

The full traceability for MVP UCs. Non-MVP UCs are deferred to v1.1 of this matrix.

### 5.1 Business Requirements → Use Cases

| BR ID | Business Requirement (short) | Realised by UC(s) | BRD reference |
|---|---|---|---|
| BR-01 | Recapture direct booking margin from OTAs via personalisation | UC-07a, UC-07b, UC-08, UC-15, UC-17 | §1, §2 |
| BR-02 | Capture guest data trapped in handwritten cards | UC-01, UC-23 | §2.2 |
| BR-03 | Capture guest data trapped in paper service tickets | UC-02 (V2) | §2.2 |
| BR-04 | Daily arrival prep without 2.5h of manual effort per FD Manager | UC-07a, UC-07b | §3.2 |
| BR-05 | Preserve guest memory across staff turnover (62%/year) | UC-08, UC-12, UC-23 | §3.3 |
| BR-06 | Front-line guest lookup in conversation (≤1.5s) | UC-08 | §5.2 |
| BR-07 | Housekeeping room prep aligned with guest preferences | UC-09 | §5.3 |
| BR-08 | External review sentiment linked to specific guests | UC-05a, UC-05b, UC-25 | §2.2 |
| BR-09 | Web + mobile both first-class surfaces | UC-07b, UC-08, UC-09 (and all UCs split-mapped) | §7 |
| BR-10 | Confidence transparency on every AI-derived field | UC-01, UC-23 (and all AI UCs) | §9 |
| BR-11 | GDPR-compliant data residency for UK/EU | (cross-cutting; all UCs subject) | §10, §15, §16.1 |
| BR-12 | PMS bidirectional integration with Mews as flagship | UC-24a (UC-24b/c V2) | §16.3 |
| BR-13 | Staff RBAC with SSO for procurement readiness | UC-28, UC-29 | §15.4 |

### 5.2 Use Cases → User Stories

Mapping every MVP UC to its implementing stories.

| UC | Stories that implement | Sprint(s) |
|---|---|---|
| UC-01 | US-01-1, US-01-2, US-01-3, US-01-4, US-01-5 | 3, 6 |
| UC-05a | US-05a-1, US-05a-2, US-05a-3 | 7, 8 |
| UC-05b | US-05b-1, US-05b-2, US-05b-3 | 8 |
| UC-07a | US-07a-1, US-07a-2, US-07a-3, US-07a-4 | 9 |
| UC-07b | US-07b-1, US-07b-2, US-07b-3, US-07b-4 | 10 |
| UC-08 | US-08-1, US-08-2, US-08-3, US-08-4, US-08-5 | 5, 6 |
| UC-09 | US-09-1, US-09-2, US-09-3, US-09-4 | 11 |
| UC-23 | US-23-1, US-23-2, US-23-3, US-23-4 | 4 |
| UC-24a | US-24a-1, US-24a-2, US-24a-3 | 2 |
| UC-25 | US-25-1, US-25-2, US-25-3 | 7 |
| UC-29 | US-29-1, US-29-2 (29-3 is V2) | 1, 2 |
| UC-28 (foundational) | US-28-1, US-28-2, US-28-3 | 1 |

### 5.3 Use Cases → Architecture Components

Which architecture components each MVP UC uses.

| UC | Uses ARC | Notes |
|---|---|---|
| UC-01 | ARC-CaptureSvc, ARC-AIGateway, ARC-PaddleOCR-VL, ARC-ERNIE-4.5, ARC-MeDo-Orchestration, ARC-ObjectStore, ARC-Postgres | Full pipeline |
| UC-05a | ARC-IngestSvc, ARC-AIGateway, ARC-ERNIE-4.5, ARC-Postgres, ARC-ObjectStore | External APIs via integration adapter |
| UC-05b | ARC-IngestSvc, ARC-AIGateway, ARC-ERNIE-X1, ARC-Postgres | Identity matching |
| UC-07a | ARC-BriefSvc, ARC-AIGateway, ARC-ERNIE-X1, ARC-ERNIE-4.5, ARC-Postgres, ARC-MeDo-Orchestration, ARC-Scheduler | Daily cron |
| UC-07b | ARC-BriefSvc, ARC-Push-Service, ARC-Email-Service, ARC-Web, ARC-Mobile, ARC-Postgres | Dual-surface |
| UC-08 | ARC-GuestSvc, ARC-AIGateway, ARC-ERNIE-4.5, ARC-ERNIE-X1, ARC-Postgres, ARC-Cache, ARC-Search-Index | Hot path; latency-critical |
| UC-09 | ARC-BriefSvc, ARC-AIGateway, ARC-ERNIE-4.5, ARC-Postgres, ARC-Push-Service, ARC-Mobile | Mobile surface |
| UC-23 | ARC-ExceptionSvc, ARC-Web, ARC-Postgres | Web-primary |
| UC-24a | ARC-IngestSvc, ARC-Webhook-Receiver, ARC-Postgres, ARC-Reconciliation-Service | Background |
| UC-25 | ARC-IngestSvc, ARC-Scheduler, ARC-Postgres | Background poll |
| UC-29 | ARC-AuthSvc, ARC-Web, ARC-Postgres | SSO |

### 5.4 Use Cases → Data Entities

Which data entities each MVP UC reads or writes.

| UC | Reads | Writes |
|---|---|---|
| UC-01 | DE-Guests, DE-Stays | DE-CardCaptures, DE-Evidence, DE-Preferences, DE-PreferenceEvidence, DE-AuditEvents, DE-ExceptionQueueItems |
| UC-05a | DE-Integrations, DE-Properties | DE-Reviews, DE-Evidence, DE-AuditEvents |
| UC-05b | DE-Reviews, DE-Stays, DE-Guests | DE-Reviews (link update), DE-AuditEvents, DE-ExceptionQueueItems |
| UC-07a | DE-Stays, DE-Guests, DE-Preferences, DE-Issues, DE-Reviews, DE-PromptVersions | DE-Briefs, DE-BriefItems, DE-AICallLogs, DE-AuditEvents |
| UC-07b | DE-Briefs, DE-BriefItems, DE-Users | DE-BriefItems (briefed-at update), DE-AuditEvents |
| UC-08 | DE-Guests, DE-Stays, DE-Preferences, DE-Issues, DE-Reviews, DE-Evidence | DE-AuditEvents (lookup logging), DE-AICallLogs |
| UC-09 | DE-Stays, DE-Guests, DE-Preferences, DE-Users | DE-HousekeepingPrep, DE-AICallLogs, DE-AuditEvents |
| UC-23 | DE-ExceptionQueueItems, DE-Evidence | DE-ExceptionQueueItems (resolution), DE-Preferences (on approve), DE-AuditEvents |
| UC-24a | DE-Integrations | DE-Stays, DE-Guests, DE-AuditEvents |
| UC-25 | DE-Integrations | (writes to DE-Reviews via UC-05a) |
| UC-29 | DE-TenantSSOConfigs, DE-Users, DE-Roles, DE-UserRoles | DE-Users (JIT provisioning), DE-AuditEvents |

### 5.5 Use Cases → API Endpoints

Which API endpoints serve each MVP UC.

| UC | Endpoints |
|---|---|
| UC-01 | `POST /captures/cards`, `GET /captures/cards/{id}` |
| UC-05a | `GET /reviews`, `GET /integrations/pms/status` (sync status surface) |
| UC-05b | `POST /reviews/{id}/link`, `POST /reviews/{id}/unlink`, `GET /reviews/{id}` |
| UC-07a | `POST /briefs/regenerate` (manual), internal scheduler (no external endpoint) |
| UC-07b | `GET /briefs/today`, `PATCH /briefs/{brief_id}/items/{item_id}`, `GET /briefs/{brief_id}/items/{item_id}/evidence` |
| UC-08 | `GET /guests`, `GET /guests/{id}?view=compact`, `GET /guests/{id}?view=full`, `POST /guests/{id}/notes` |
| UC-09 | `GET /prep/tomorrow`, `POST /prep/assignments`, `PATCH /prep/{id}/complete` |
| UC-23 | `GET /exceptions`, `GET /exceptions/{id}`, `POST /exceptions/{id}/approve`, `POST /exceptions/{id}/edit`, `POST /exceptions/{id}/reject`, `POST /exceptions/{id}/defer` |
| UC-24a | `POST /webhooks/pms/{integration_id}` (inbound), `GET /integrations/pms/status`, `POST /integrations/pms/{id}/reconcile` |
| UC-25 | (background only — no external endpoint) |
| UC-29 | `POST /auth/sso/start`, `POST /auth/sso/callback`, `POST /tenant/sso/config`, `GET /auth/me` |

### 5.6 Use Cases → Acceptance Criteria → Test Cases (skeleton)

Test cases are formally specified in Document 9 (Test Strategy). This section shows the AC→TC linkage skeleton.

| UC | AC count | Initial TC count target | Status |
|---|---|---|---|
| UC-01 | 6 | 12 (2× AC) | TCs to be defined in Test Strategy doc |
| UC-05a | 3 | 6 | Pending |
| UC-05b | 3 | 6 | Pending |
| UC-07a | 4 | 8 | Pending |
| UC-07b | 4 | 8 | Pending |
| UC-08 | 4 | 8 | Pending |
| UC-09 | 4 | 8 | Pending |
| UC-23 | 4 | 8 | Pending |
| UC-24a | 3 | 6 | Pending |
| UC-25 | 3 | 6 | Pending |
| UC-29 | 3 | 6 | Pending |
| **MVP total** | **41 ACs** | **~82 TCs target** | Defined in Test Strategy |

### 5.7 Cross-cutting traceability

Some requirements cut across all UCs. These are tracked separately because mapping them per-UC would create noise.

| Cross-cutting requirement | Realised by |
|---|---|
| BR-11 (data residency) | ARC-EU-Postgres, ARC-EU-ObjectStore, ARC-AIGateway data-minimisation; enforced via tests TC-CROSS-residency-* |
| All RBAC enforcement | ARC-AuthSvc, DE-Roles, DE-UserRoles; enforced via tests TC-CROSS-rbac-* |
| All audit logging | DE-AuditEvents, ARC-AuditSvc; enforced via tests TC-CROSS-audit-* |
| Multi-tenant isolation | RLS policies on DE-* tables, ARC-AuthSvc; enforced via tests TC-CROSS-tenancy-* |
| Idempotency on writes | API design (header), ARC-API-Gateway; enforced via tests TC-CROSS-idempotency-* |

---

## 6. Coverage analysis — what's traced, what isn't

### 6.1 Coverage as of v1.0

| Coverage | Status |
|---|---|
| BRs traced to UCs | 13 of 13 (100%) |
| MVP UCs traced to stories | 11 of 11 (100%) — counting UC-05a/b, UC-07a/b, UC-24a separately |
| MVP UCs traced to architecture components | 11 of 11 (100%) |
| MVP UCs traced to data entities | 11 of 11 (100%) |
| MVP UCs traced to API endpoints | 11 of 11 (100%) — UC-25 has no external endpoint, which is correct |
| MVP UCs traced to ACs | 11 of 11 (100%) |
| MVP ACs traced to TCs | 0 of 41 (0%) — pending Test Strategy doc |
| Non-MVP UCs traced | 0 of 26 (0%) — deferred to v1.1 |

### 6.2 Coverage commitments

- **By Sprint 0 completion:** TC linkage for all MVP ACs must be at 80%+
- **By MVP launch (Sprint 12):** TC linkage at 100% for all MVP ACs
- **By Sprint 18:** Non-MVP UCs traced as they enter active development

### 6.3 The trickiest coverage gap

**TC linkage being 0%** is the realest gap right now. The Test Strategy document (Document 9 in this set) will fix this. Until then, the matrix can verify "every UC has stories implementing it" but cannot verify "every UC has tests covering it."

This is exactly the kind of gap a SOC 2 auditor would surface. It's not a project failure — it's a "we are at Document 8 of 10" reality. But it's the gap most worth keeping in front of you.

---

## 7. Gap register

Open gaps identified by traceability analysis. Each gap becomes an action item.

| Gap ID | Description | Severity | Owner | Target resolution |
|---|---|---|---|---|
| GAP-001 | TC linkage for MVP ACs is 0% — pending Test Strategy document | High | QA Lead | Document 9 in this set |
| GAP-002 | Non-MVP UCs (26) have no story decomposition yet | Medium | Engineering Lead | As each UC enters active sprint planning |
| GAP-003 | Cross-cutting requirement BR-11 (residency) has no UC-specific testing strategy yet | High | Engineering Lead + Security | Sprint 4 |
| GAP-004 | UC-25 has no UI/API surface — verify status visibility is delivered via UC-24a's status endpoint | Low | Engineering Lead | Sprint 7 |
| GAP-005 | Architecture component naming inconsistent in places (e.g., "ARC-AIGateway" vs "AI Gateway") — standardise | Low | Documentation owner | Sprint 2 |
| GAP-006 | Open Architecture Questions (AQ-01 to AQ-08) not yet linked to a resolution UC or sprint | Medium | Engineering Lead | Sprint 0 |
| GAP-007 | Compliance UCs (UC-18 to UC-21) are V2 but BR-11 is realised partly through them — first UK customer launch needs these traced and built | High (commercial) | Product + Engineering | Sprint 12 |
| GAP-008 | Open API Questions (API-01 to API-08) not yet linked to a resolution sprint | Medium | Engineering Lead | Sprint 1 |

### 7.1 Gap lifecycle

Each gap moves through: `open` → `in-progress` → `resolved`. Resolution requires either (a) the gap is closed by an artefact change, or (b) the gap is accepted with a written rationale (e.g., "We accept that non-MVP UCs are not story-decomposed because they're not in active sprint planning").

---

## 8. Audit trail

Every change to this matrix is logged here. This is the audit-pack-ready table.

| Change ID | Date | Author | Change summary | Triggered by |
|---|---|---|---|---|
| CHG-0001 | 2026-05-18 | Senthil + Claude | Initial matrix v1.0 created with MVP scope | Initial creation |

### 8.1 What gets logged

Every PR that modifies this matrix must add a CHG-NNNN entry above with:
- Date (UTC)
- Author
- Change summary (1–2 sentences)
- Triggered by (which artefact change in the source documents drove this update)

### 8.2 Audit-pack readiness

For SOC 2 or GDPR auditor requests, this section is the queryable history of "how did we know requirement X was implemented?" The chain is:
1. Auditor asks about BR-11
2. Matrix §5.7 shows realising components and test categories
3. Audit trail (this section) shows when each linkage was established
4. Source documents (BRD, Architecture, Test Strategy) provide depth
5. Audit log in the running system (`audit_events` table) shows operational evidence

Without this matrix, step 2 takes a week. With it, step 2 is a single query.

---

## 9. What this document does *not* cover

| Topic | Deferred to |
|---|---|
| Test case definitions and their linkage to ACs | Test Strategy (Document 9) |
| Sprint sequencing of work | Sprint Plan (Document 10) |
| Test execution status (which tests pass/fail) | Test execution dashboard (out of scope for static document) |
| Project management — who is doing what when | Issue tracker / project board |
| Real-time matrix querying (CLI or UI) | Phase 2 tooling (Sprint 14+) |

---

## 10. Document control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 18 May 2026 | Senthil with Claude | Initial matrix; MVP scope traced; update protocol defined; 8 gaps registered |

---

*End of Roomard Live Traceability Matrix v1.0 — 18 May 2026.*
