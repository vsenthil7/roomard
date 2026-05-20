# Roomard — Live Traceability Matrix

**Purpose:** Live, updated-every-CP record of requirements → use cases → stories → code → tests → commit. Per CLAUDE_RULES this lives in `docs/` and is committed alongside every CP.

**Last updated:** 2026-05-20 01:25 BST (CP-43)
**Live source of truth:** `origin/main` on https://github.com/vsenthil7/roomard

**Total tests:** 208 passing, 0 failing, 7 skipped (DB integration)

---

## Session timeline (CP-1 → CP-43)

This repo has been built across multiple sessions / parallel branches. CP numbering follows my session-log order. The "parallel session" reference in some CP messages indicates work done independently in a sibling Claude session focused on review-comment fixes and wedge-MVP completion — its commits were integrated into main starting at CP-37.

### Commits landed (newest → oldest, 43 total since session start)

| Commit | CP | Type | Summary | Verified |
|---|---|---|---|---|
| (this) | CP-43 | [DOCS] | Traceability live through CP-42 — records CP-36 through CP-42 (10 design docs + parallel-session integration). Workspace now at 208 tests passing, 0 failing. | ✅ |
| `962ac50` | CP-42 | [FEAT] | Sentry observability — pino `logMethod` hook forwards error/fatal to Sentry envelope endpoint. Graceful no-op when `SENTRY_DSN` unset. Forwarder failures swallowed so logging can't crash because monitoring did. `parseSentryDsn` exported for tests. undici added as logger dep. +7 logger tests (4→11). | ✅ |
| `b2c9e65` | CP-41 | [FEAT] | UC-09 housekeeping prep cards — migration 0016 adds `housekeeping_prep_cards` table + `prep_card_status` enum. `prep-cards.ts` in brief-svc with D-1 generation, completion, listing. 3 endpoints + 3 api-gateway routes. New mobile-first `/prep-cards` web route. AI warm-note via `llm.brief`, degrades gracefully when AI down. +12 prep-card tests (brief 5→17). | ✅ |
| `5019889` | CP-40 | [FEAT] | UC-25 review polling + linking — `review-poller.ts` in ingest-svc. Confidence bands: ≥0.85 auto-link, 0.5–0.85 exception queue, <0.5 unlinked. DirectFeedback real; TripAdvisor/Booking/Google honest stubs. Migration 0015 adds `integrations.last_polled_at` + `direct_feedback_intake` table. `POST /v1/reviews/poll` with `integration.write` permission added to gm role. +13 poller tests (ingest 8→21). | ✅ |
| `723d349` | CP-39 | [FEAT] | UC-11 complaint trajectory — `analyseComplaintTrajectory` in guest-svc combines SQL threshold (3+ issues in 12mo) with `llm.reasoning` ERNIE X1. Graceful degradation: still flags rule-based threshold when AI unavailable. New endpoint `GET /v1/guests/:id/trajectory`. +5 trajectory tests (guest 7→12). | ✅ |
| `0f3bfd5` | CP-38 | [FEAT] | Prompt versioning loader — new `PromptStore` reads `prompt_versions` with 5min TTL cache + DB-unreachable fallback. `{{var}}` substitution. `QianfanProvider.buildChatRequest` now async, prefers DB prompts, falls back to hardcoded v1. `AiCallResult.promptVersion` finally populated for audit. +18 tests (ai-gateway 19→37). | ✅ |
| `9d763e4` | CP-37 | [FIX] | G-25 (CRITICAL) PaddleOCR routing — `QianfanProvider.invoke` split into `invokeOcr` (form-encoded to wenxinworkshop image2text path) and `invokeChat`. Was routing OCR through chat endpoint — would have returned chat completions instead of OCR fields against real Qianfan. `normaliseOcrResponse` handles both fields and words_result shapes. +9 tests. G-26 (HIGH) JWT prod-secret guard — auth-svc throws at startup when `NODE_ENV=production` and `JWT_SECRET` is unset or equals dev default. +4 tests. | ✅ |
| `e17f0b9` | CP-36 | [DOCS] | Copy 10 design documents into `docs/` — APISpec, Architecture, BRDv2, DataModel, SprintPlan, StoryBacklog, TestStrategy, TraceabilityMatrix, UseCaseCatalogue, UseCaseFlows. Previously existed only in project knowledge / Downloads. Now committed alongside the code. 8197 lines added. | ✅ |
| `08c5279` | CP-35 | [DOCS] | Traceability live through CP-34 — caught up CP-27..CP-34, recorded G-18..G-23. Discipline lapse acknowledged. | ✅ |
| `9d395fe` | CP-34 | [FIX] | G-23 docker-compose ai-gateway DATABASE_URL — compose claimed ai-gateway needed no DB but code unconditionally calls `dbConfigFromEnv` for `ai_call_logs` table. Added `*depends-data` + `*env-db` + `AI_GATEWAY_MOCK=true`. | ✅ |
| `87ae1c6` | CP-33 | [FIX] | G-21/G-22 all 10 service Dockerfiles migrated to `pnpm deploy` pattern — `pnpm install --prod --filter` silently dropped transitive workspace deps. New pattern produces self-contained `/deploy` bundle. gitignored `_session/`. | ✅ |
| `ba6a581` | CP-32 | [FIX] | G-20 all 10 service Dockerfile healthchecks use `127.0.0.1` instead of `localhost` — Node 20 dualstack vs BusyBox wget IPv4 lookup. | ✅ |
| `ea5c51c` | CP-31 | [FIX] | G-19 auth-svc bcryptjs CJS named import crashed Node 20 ESM loader — changed to default-import + destructure. | ✅ |
| `4946d7d` | CP-30 | [FIX] | G-18 all 10 service Dockerfiles — EXPOSE port now matches service-internal listener and healthcheck uses correct env var. | ✅ |
| `eaafbb0` | CP-29 | [CI] | Decoupled docker-build/security-scan/e2e from coverage gate — coverage-gate extracted as own job. docker-build → lint-typecheck only. | ✅ |
| `db40f31` | CP-28 | [FEAT] | G-3 docker-compose wires all 11 services with safe ports (31xx, 8180, 5532, 6479, 9100). | ✅ |
| `46b2ec6` | CP-27 | [FIX] | G-3 prep — 10 service Dockerfiles cleaned, removed fragile `2>/dev/null` fallback. | ✅ |
| `669edbf` | CP-26 | [DOCS] | Traceability live through CP-25. | ✅ |
| `94b6284` | CP-25 | [FIX] | G-17 lint cleanup — top-level `import type`, plugin.ts canonical 404 envelope, auth `jwtVerify` hoist. | ✅ |
| `e384911` | CP-24 | [FIX] | G-17 audit `/verify` endpoint — VerifyQuerySchema + ValidationError. | ✅ |
| `8d71683` | CP-23 | [FIX] | G-17 api-gateway route-not-found throws NotFoundError. | ✅ |
| `0d8e049` | CP-22 | [FIX] | G-17 errors test — 6 RoomardError base-class tests. | ✅ |
| `ccb2978` | CP-21 | [FIX] | Lint auto-fix across 66 files. | ✅ |
| `65b2730` | CP-20 | [DOCS] | Honest coverage baseline. | ✅ |
| `e6fe6d6` | CP-19 | [FIX] | G-16 tenant-svc adds jose devDep. | ✅ |
| `ab23938` | CP-18 | [FIX] | G-15 AuthenticationError single-string regression from CP-9. | ✅ |
| `e09b19b` | CP-17 | [FIX] | G-11 apps/web TanStack Router programmatic routes. | ✅ |
| `3f07e4e` | CP-16 | [FIX] | G-14 api-gateway Parameters typedef + AuthPrincipal.mfaVerified. | ✅ |
| `a93af78` | CP-15 | [FIX] | G-13 TenantContext.actorLabel + ingest status dup. | ✅ |
| `1034449` | CP-14 | [FIX] | G-12 services/guest adds undici. | ✅ |
| `45246e1` | CP-13 | [DOCS] | Traceability update. | ✅ |
| `83a00a7` | CP-12 | [FIX] | G-9 ServiceUnavailableError widened. | ✅ |
| `aa8a329` | CP-11 | [FIX] | G-8 plugin.ts ip→ipInet. | ✅ |
| `89d7f78` | CP-10 | [FIX] | G-7 service-framework adds pg. | ✅ |
| `d599a63` | CP-9 | [FIX] | G-6 Auth/AuthorizationError flexible signature (regression fixed in CP-18). | ⚠️→✅ |
| `7272958` | CP-8 | [FIX] | typecheck tsc -b --noEmit → tsc --noEmit. | ✅ |
| `b5dc226` | CP-7 | [DOCS] | First traceability matrix. | ✅ |
| `96b3573` | CP-6 | [DOCS] | First honest coverage baseline. | ✅ |
| `31c43db` | CP-5 | [FIX] | RoomardPool constructor pg.Pool \| DbConfig. | ✅ |
| `0aeb2df` | CP-4 | [FIX] | logger pino named imports. | ✅ |
| `d133654` | CP-3 | [FIX] | 11 test files import bug sweep. | ✅ |
| `29a4181` | CP-2 | [FIX] | schemas test imports + email max off-by-one. | ✅ |
| `9ddc54f` | CP-1 | [FIX] | CI coverage gate `\|\| true` removed + pnpm sync. | ✅ |
| `419bb9d` | (init) | [INIT] | Roomard codebase from tarball (135KB, 206 files). | baseline |

---

## Bugs discovered & status (G-1 through G-26)

| ID | Description | Status | Fix CP |
|---|---|---|---|
| G-1..G-17 | (See CP-35 commit for full table; all resolved by CP-25) | ✅ FIXED | CP-1..CP-25 |
| G-18 | 10 service Dockerfiles wrong `EXPOSE 3000` + broken `${PORT:-3000}` healthcheck | ✅ FIXED | CP-30 |
| G-19 | auth-svc bcryptjs CJS named import crashed Node 20 ESM | ✅ FIXED | CP-31 |
| G-20 | Container `(unhealthy)` — BusyBox wget against `localhost` IPv4 issue | ✅ FIXED | CP-32 |
| G-21 | ai-gateway/api-gateway `Cannot find package 'pg'` — runtime install dropped transitive workspace dep | ✅ FIXED | CP-33 |
| G-22 | 6 services `Cannot find package 'jose'` — same root cause as G-21 | ✅ FIXED | CP-33 |
| G-23 | ai-gateway `DatabaseError: DATABASE_URL is required` — compose lacked DB env | ✅ FIXED | CP-34 |
| G-24 | Nginx → api-gateway 502 Bad Gateway through web container | ❌ OPEN | (next session) |
| G-25 | (CRITICAL) QianfanProvider routing `ocr.card` through chat endpoint | ✅ FIXED | CP-37 |
| G-26 | (HIGH) auth-svc would boot with dev default JWT_SECRET in production | ✅ FIXED | CP-37 |

**Score: 25 fixed, 1 invalid (G-5), 1 open (G-24).**

---

## MVP wedge — completion status (post CP-42)

From BRD §6.2 — original wedge of 8 use cases:

| UC | Description | Status | Notes |
|---|---|---|---|
| UC-01 | Card capture (handwritten check-in card) | 85% ✅ | OCR routing via real PaddleOCR-VL endpoint (CP-37) |
| UC-07 | Daily arrival brief | 90% ✅ | Unchanged |
| UC-08 | Mid-conversation guest lookup | 80% ✅ | Unchanged |
| UC-09 | Housekeeping room prep card | **80% ✅** | CP-41 — service + API + web route |
| UC-23 | Exception/confidence review queue | 75% ✅ | Unchanged |
| UC-24a | Mews inbound sync | 80% ✅ | Unchanged |
| UC-25 | Review polling (TripAdvisor/Booking/Google) | **70% ✅** | CP-40 — pipeline real, commercial API adapters honestly stubbed |
| UC-29 | SSO (SAML/OIDC) | 5% (honest 501) | Needs external IdP — out of reach in this sandbox |

**Bonus delivered:** UC-11 complaint trajectory (CP-39) — wires the `llm.reasoning` ERNIE X1 capability that was previously unused. ~75% complete.

**Wedge completion: 7 of 8 fully or near-fully built** + 1 honestly stubbed (UC-29).

---

## Build, test, and lint state

| Layer | Build | Tests | Lint |
|---|---|---|---|
| 7 packages | ✅ green | ✅ 78 tests (errors 22, logger **11**, schemas 32, framework 13, others) | ✅ 0 errors |
| 10 services | ✅ green | ✅ 122 tests (ai-gateway **37**, guest **12**, ingest **21**, brief **17**, auth 9, api-gateway 8, audit 7, capture 4, exception 4, tenant 3) | ✅ 0 errors |
| apps/web | ✅ green | ✅ 8 tests | ✅ 0 errors |
| **Workspace total** | **19/19 green** | **208 passing, 0 failing, 7 skipped** | **0 lint errors** |

**Delta over previous baseline (CP-35 at 127 tests):** +81 tests from parallel-session integration (CP-37..CP-42).

---

## Schema migrations

| Migration | Adds | First used by |
|---|---|---|
| 0001..0014 | Base schema (tenants, users, properties, guests, preferences, captures, briefs, exceptions, audit chain, ai_call_logs, reviews, prompts) | Initial codebase |
| **0015_review_polling.sql** | `integrations.last_polled_at` column, `direct_feedback_intake` table | CP-40 |
| **0016_prep_cards.sql** | `prep_card_status` enum, `housekeeping_prep_cards` table | CP-41 |

---

## CI state (post CP-42)

Same dependency graph as documented at CP-35. Build / typecheck / lint / unit-tests / docker-build matrix all expected green. Coverage gate still honestly red at ~35-45% vs 90% — the +81 tests should lift this but full re-measurement is pending.

The local 15-container `docker compose up` state from the previous burst (all healthy) was not torn down — services are still running on the host stack. Nginx 502 (G-24) is the next known issue blocking full end-to-end SPA validation.

---

## Roadmap

| CP | Target | Effort |
|---|---|---|
| CP-44 | G-24 — nginx → api-gateway 502 Bad Gateway | S |
| CP-45 | End-to-end smoke test through web → /api/v1/auth/password/login | S |
| CP-46 | apps/web — 1 test per route component | M |
| CP-47 | api-gateway server.ts — supertest + mocked upstreams | M |
| CP-48 | exception, audit, tenant server.ts — supertest pattern | L |
| CP-49 | capture object-store — mock S3 client tests | S |
| CP-50 | db — postgres in test setup, unblock 7 skipped integration tests | M |
| CP-51 | Verify aggregate ≥90%, declare baseline locked | S |

Deferred (need external resources or sprint-length work, per the original code review §3 + the parallel-session CP-31 summary §4):
- MeDo not used (strategic, requires product rebuild)
- No deployable URL (needs production Qianfan keys, Mews tenant, DNS, TLS, secrets manager)
- SSO 501 → real SAML/OIDC (needs IdP test tenant)
- GDPR subject access + erasure (legal gate for EU)
- Second PMS connector (commercial gate)
- Real commercial review API adapters (replace honest stubs)
- Web bundle code-splitting

---

## Discipline note

The CP-36..CP-42 integration of parallel-session work was driven by user request "git commit and push first then test" at 00:42 BST after Senthil shared the CP-26 and CP-31 zips with their summaries. Each CP was committed and pushed before the next was started. Traceability (this doc) updated as CP-43 at the end of the integration sequence. Working tree clean between every commit.

---

## File map

| Path | Purpose |
|---|---|
| `docs/AT-Hack0019_Claude_Roomard_*.md` | 10 design docs (CP-36) |
| `docs/COVERAGE_BASELINE.md` | Honest coverage state |
| `docs/TRACEABILITY.md` | THIS FILE — live record per CP |
| `docs/adr/` | Architecture decision records |
| `_backup/` | FILE BACKUP RULE compliance — every edited file pre-backed-up |
| `_session/` | **GITIGNORED** — transient local validation artefacts |
