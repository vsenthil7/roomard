# Roomard — Live Traceability Matrix

**Purpose:** Live, updated-every-CP record of requirements → use cases → stories → code → tests → commit. Per CLAUDE_RULES this lives in `docs/` and is committed alongside every CP.

**Last updated:** 2026-05-20 08:16 BST (CP-53)
**Live source of truth:** `origin/main` on https://github.com/vsenthil7/roomard

**Total tests:** 250 passing, 0 failing, 7 skipped (DB integration)

---

## Session timeline (CP-1 → CP-53)

This repo has been built across multiple sessions / parallel branches. CP numbering follows my session-log order. The "parallel session" reference in some CP messages indicates work done independently in a sibling Claude session focused on review-comment fixes and wedge-MVP completion — its commits were integrated into main starting at CP-37.

### Commits landed (newest → oldest, 53 total since session start)

| Commit | CP | Type | Summary | Verified |
|---|---|---|---|---|
| (this) | CP-53 | [DOCS] | Traceability live through CP-52 — records the server-level supertest coverage push and the `createFakePool` test-utils helper. Workspace 228→250 tests. No new G-issues. | ✅ |
| `0ea1ce3` | CP-52 | [FEAT] | Server-level supertests for tenant/audit/exception — closes the exact test gap that hid the G-28→G-32 cascade (these services had only logic tests, never exercised `buildServer` through HTTP). New reusable `createFakePool` in test-utils (satisfies the `connect`→`BEGIN`→`SET LOCAL`→query→`COMMIT` sequence; substring-matched row rules). New `server.test.ts` per service via `app.inject` + `mintTestToken`: /health, 401-no-token, 200-happy, JSON-not-415, 403-insufficient-perm, 404-envelope. tenant 3→10, audit 7→14, exception 4→12 (+22). Lint 0/0. | ✅ |
| `12c4567` | CP-51 | [DOCS] | Traceability live through CP-50 — records the **login-loop breakthrough**: G-31✅ (DB provisioned: 16 migrations + seed applied to container Postgres), G-32✅ (auth `buildSession` permission-shape bug), and G-24✅ (nginx 502 resolved as a downstream symptom of G-28/G-29). Full chain verified live: `POST /v1/auth/password/login` → 200 + 317-char JWT; `/v1/auth/me` with Bearer → 200; `web:8180/api/v1/auth/...` browser path → 200. 15/15 containers healthy, 228 workspace tests green. Score 33 fixed, 1 invalid, 0 functional open. | ✅ |
| `b8ab5c1` | CP-50 | [FIX] | G-31 (provisioning) applied all 16 migrations + seed to the container Postgres (demo tenant `demo`, 3 users incl. `admin@demo.roomard.local` / `Roomard123!`, 6 roles, property, sample guests). G-32 (code bug) `buildSession` used `jsonb_array_elements_text` on a jsonb *object* → Postgres 22023 on every login. Fixed with exported `flattenRolePermissions` (object-of-arrays → canonical `resource.action`; singularises plurals; collapses `all`/`*` → `*`; legacy array passthrough; safe on null/non-object). +7 unit tests (auth 9→16). Lint 0/0. | ✅ unit + live |
| `b9328a5` | CP-49 | [DOCS] | Traceability live through CP-48 — recorded G-28/G-29/G-30 fixes, ticketed G-31; score 30 fixed/1 invalid/2 open; key learning re live-stack vs mocked tests. | ✅ |
| `7d3f691` | CP-48 | [FIX] | G-30 auth-svc routes missing `/v1` prefix — the gateway forwards the full inbound URL (`/v1/auth/...`) unchanged and every other service uses `/v1/`, but auth-svc registered at `/auth/...` with publicPaths also lacking `/v1`. Framework preHandler then demanded a Bearer token on the login endpoint itself — a chicken-and-egg lockout. Aligned all 7 auth routes + 5 publicPaths to `/v1/auth/...`. 9/9 auth tests pass (service-level, no path churn). | ✅ unit + live |
| `fc05e2a` | CP-47 | [FIX] | G-29 api-gateway forwarded hop-by-hop headers to undici — `expect: 100-continue` (sent by PowerShell Invoke-WebRequest, browsers, curl) makes undici throw `UND_ERR_NOT_SUPPORTED` → 500. Added module-scope `HOP_BY_HOP_HEADERS` set (RFC 7230 §6.1 + `expect`); forward loop strips them while preserving application + edge-identity headers. +1 G-29 regression test (api-gateway 13→14). Surfaced the instant CP-46 let POSTs reach the proxy handler. | ✅ unit + live |
| `cd9109c` | CP-46 | [FIX] | G-28 api-gateway JSON content-type parser + statusCode forwarding — (1) `addContentTypeParser('application/json', {parseAs:'buffer'})` so Fastify 5 catch-all routes accept JSON bodies (was throwing `FST_ERR_CTP_INVALID_MEDIA_TYPE` 415 before the handler). (2) `setErrorHandler` forwards `FST_`-prefixed 4xx statusCodes instead of masking as 500. New `server.test.ts` (+5 tests, 3 G-28 regressions). api-gateway 8→13. | ✅ unit + live |
| `2cd0a8c` | CP-45 | [DOCS] | Traceability live through CP-44 — recorded G-27 fix + ticketed G-28; 15/15 healthy milestone. | ✅ |
| `0b23569` | CP-44 | [FIX] | G-27 ingest-svc duplicate `/health` route registration crashed startup — `applyFramework` registers `/health` automatically; the CP-31-imported server.ts re-registered it (`FST_ERR_DUPLICATED_ROUTE`). Container restart-looped. Removed the redundant registration. Latent in unit tests; surfaced only on container deploy. Verified healthy in 47s. 21/21 ingest tests pass. | ✅ |
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

## Bugs discovered & status (G-1 through G-32)

| ID | Description | Status | Fix CP |
|---|---|---|---|
| G-1..G-17 | (See CP-35 commit for full table; all resolved by CP-25) | ✅ FIXED | CP-1..CP-25 |
| G-18 | 10 service Dockerfiles wrong `EXPOSE 3000` + broken `${PORT:-3000}` healthcheck | ✅ FIXED | CP-30 |
| G-19 | auth-svc bcryptjs CJS named import crashed Node 20 ESM | ✅ FIXED | CP-31 |
| G-20 | Container `(unhealthy)` — BusyBox wget against `localhost` IPv4 issue | ✅ FIXED | CP-32 |
| G-21 | ai-gateway/api-gateway `Cannot find package 'pg'` — runtime install dropped transitive workspace dep | ✅ FIXED | CP-33 |
| G-22 | 6 services `Cannot find package 'jose'` — same root cause as G-21 | ✅ FIXED | CP-33 |
| G-23 | ai-gateway `DatabaseError: DATABASE_URL is required` — compose lacked DB env | ✅ FIXED | CP-34 |
| G-24 | Nginx → api-gateway 502 Bad Gateway through web container — was a downstream symptom of the gateway's G-28/G-29 failures (nginx proxies to a gateway that 500'd on every JSON POST). Resolved once the gateway could handle bodies. Verified: `web:8180/api/v1/auth/password/login` → 200 + JWT. | ✅ FIXED | CP-46/47 (confirmed CP-50) |
| G-25 | (CRITICAL) QianfanProvider routing `ocr.card` through chat endpoint | ✅ FIXED | CP-37 |
| G-26 | (HIGH) auth-svc would boot with dev default JWT_SECRET in production | ✅ FIXED | CP-37 |
| G-27 | ingest-svc duplicate `/health` registration — `FST_ERR_DUPLICATED_ROUTE` crashed startup. Surfaced ONLY after CP-31 zip was deployed in container — latent in unit tests because they don't exercise `buildServer` → `applyFramework` integration. | ✅ FIXED | CP-44 |
| G-28 | api-gateway returns HTTP 500 on every JSON POST. Root cause: `FST_ERR_CTP_INVALID_MEDIA_TYPE` (Fastify 5 has no default JSON parser for routes registered via `app.route({ url: '/v1/*' })` catch-all without an explicit `addContentTypeParser`). Compounded by: `setErrorHandler` returns generic 500 instead of forwarding the FastifyError's `statusCode: 415`. Blocks the entire SPA → api-gateway → upstream chain for any POST/PATCH. | ✅ FIXED | CP-46 |
| G-29 | api-gateway forwarded hop-by-hop headers (incl. `expect: 100-continue`) to undici, which throws `UND_ERR_NOT_SUPPORTED` → 500. Surfaced the instant G-28 was fixed and POSTs first reached the proxy handler. | ✅ FIXED | CP-47 |
| G-30 | auth-svc registered routes at `/auth/...` while the gateway forwards `/v1/auth/...` (every other service uses `/v1/`). Login was a chicken-and-egg lockout — framework preHandler demanded a Bearer token on the login endpoint. | ✅ FIXED | CP-48 |
| G-31 | DB schema never migrated to the running Postgres container — `relation "users" does not exist` on first real login. Provisioning gap, not a code bug. Applied 16 migrations + seed via `DATABASE_URL=...@localhost:5532/roomard pnpm --filter @roomard/db migrate` then `seed`. | ✅ FIXED | CP-50 |
| G-32 | auth-svc `buildSession` queried `roles.permissions` with `jsonb_array_elements_text` (array-only) but the schema/seed store permissions as an OBJECT of `{ resource: [actions] }` (or `{ all: ['*'] }`). Every login threw Postgres 22023 `cannot extract elements from an object` *after* the user lookup succeeded. Fixed by fetching raw jsonb and flattening in TypeScript (`flattenRolePermissions`). | ✅ FIXED | CP-50 |

**Score: 33 fixed, 1 invalid (G-5), 0 functional bugs open.**

The login path is now demonstrably working end to end on the live 15-container stack — a user can authenticate through the browser-facing nginx route and receive a working JWT that the gateway accepts on protected endpoints.

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
| 10 services | ✅ green | ✅ 164 tests (ai-gateway **37**, ingest **21**, brief **17**, **auth 16**, **audit 14**, **api-gateway 14**, **exception 12**, guest **12**, **tenant 10**, capture 4) | ✅ 0 errors |
| apps/web | ✅ green | ✅ 8 tests | ✅ 0 errors |
| **Workspace total** | **19/19 green** | **250 passing, 0 failing, 7 skipped** | **0 lint errors** |

**Delta:** +22 tests since CP-51 (CP-52 server-level supertests: tenant +7, audit +7, exception +8). The three services that previously had no HTTP-layer test now exercise `buildServer` end to end — the gap that hid the G-28→G-32 cascade is closed for them.

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

**Post-CP-50 milestone — the login loop is verified working end to end on the live stack.** The four-layer bug cascade (G-28→G-29→G-30→G-31/G-32) is fully closed:
- `POST http://localhost:3100/v1/auth/password/login` (admin@demo.roomard.local / Roomard123! / tenant `demo`) → **200**, `status: success`, a real 317-char HS256 JWT `access_token` + `refresh_token` + expiries.
- `GET http://localhost:3100/v1/auth/me` with `Authorization: Bearer <token>` → **200**, returns the authenticated user + tenant slug. Proves the full issue→verify→RBAC→tenant-resolution loop.
- `POST http://localhost:8180/api/v1/auth/password/login` (the browser-facing nginx route, which rewrites `/api/` → `/` and proxies to `api-gateway:3000`) → **200** + JWT. This confirms G-24 (nginx 502) is resolved.
- **15/15 containers healthy** with all CP-37..CP-50 code integrated; database provisioned with 16 migrations + seed.

**Key learning:** unit tests with mocked undici could not have caught G-29 (needs a real client sending `expect`) or G-30 (needs the real gateway→upstream path). The live-stack smoke test earned its keep. Cross-service path-prefix mismatches like G-30, and schema/code contract mismatches like G-32, are invisible to per-service unit tests — only an integration test through the actual gateway against a real DB catches them. The coverage roadmap (CP-52+) prioritises exactly this gap.

---

## Roadmap

With all functional bugs closed and the login loop verified live, the remaining work is the coverage lift toward the ≥90% gate.

| CP | Target | Effort |
|---|---|---|
| ~~CP-52~~ | ~~exception, audit, tenant server.ts — server-level supertest pattern~~ | ✅ DONE (CP-52, +22 tests) |
| CP-54 | guest, brief, ingest server.ts — extend the `createFakePool` + `app.inject` pattern to the remaining services that lack HTTP-layer tests | M |
| CP-55 | apps/web — 1 test per route component (incl. the new `/prep-cards` route) | M |
| CP-56 | capture object-store — mock S3 client tests | S |
| CP-57 | db — postgres in test setup, unblock 7 skipped integration tests | M |
| CP-58 | api-gateway — broaden server.test.ts upstream-proxy coverage | M |
| CP-59 | Verify aggregate ≥90%, declare baseline locked | S |

Optional live-stack hardening (not blocking coverage): a one-shot DB-migrate init container or compose `depends_on` hook so a fresh `docker compose up` provisions the schema automatically (today G-31 requires a manual `migrate`+`seed` run).

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
