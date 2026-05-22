# Roomard — Live Traceability Matrix

**Purpose:** Live, updated-every-CP record of requirements → use cases → stories → code → tests → commit. Per CLAUDE_RULES this lives in `docs/` and is committed alongside every CP.

**Last updated:** 2026-05-22 04:20 BST (CP-89)
**Live source of truth:** `origin/main` on https://github.com/vsenthil7/roomard

**Total tests:** 356 passing, 0 failing (workspace unit suites; web 39/39; ai-gateway 45/45 incl. the two updated to the real `ai_call_status` enum); **12 real-DB integration tests** (guest 4, tenant 5, capture 3) idempotent + re-runnable via `scripts/run-integration-tests.bat`

> **Demo video status (CP-89):** the demo data layer is now real and populated end-to-end. After CP-88 added the onboarding UI, CP-89 fixes the three further schema-drift bugs (G-45/46/47) that were the actual reason the brief screen was blank — brief generation now returns `ready` with real arrivals, the brief screen renders 3 ranked guests with say-this + preference callouts + a real recent-issue flag, and prep cards generate with AI warm notes. Verified live: `briefs/today → 200` (3 items), `prep-cards/today → 200` (3 cards). Demo tenant cleaned of test pollution and re-seeded to one clean set of 3 guests + arrivals (today + tomorrow) + a recent issue. Next: record the product-story walkthrough against this populated stack. The committed demo MP4 remains the morning verdict-edition until that recording is verified.

---

## Session timeline (CP-1 → CP-89)

This repo has been built across multiple sessions / parallel branches. CP numbering follows my session-log order. The "parallel session" reference in some CP messages indicates work done independently in a sibling Claude session focused on review-comment fixes and wedge-MVP completion — its commits were integrated into main starting at CP-37.

### Commits landed (newest → oldest, 89 total since session start)

| Commit | CP | Type | Summary | Verified |
|---|---|---|---|---|
| (this) | CP-89 | [FIX] | **G-45 + G-46 + G-47 — the three schema-drift bugs that kept the brief screen blank/fake, all surfaced by generating a brief against the live DB for real.** **G-45** (`services/brief/src/pipeline.ts`): the `briefs` INSERT/UPDATE referenced `total_arrivals`, `items_json`, `model_id` — none exist; the real column is `item_count` (items live in `brief_items`). Brief generation 500'd with `42703`. Fixed to `item_count`, dropped `items_json`/`model_id`. **G-46** (same file + reconciling with the web UI): the `brief_items` INSERT used `display_name`/`room_number`/`arrival_at`/`preference_callouts`/`recent_issues`/`confidence`/`confidence_calibration`/`position`, but the real columns are `sort_index`/`preference_summary`/`say_this_suggestion`/`history_summary`/`attention_notes`/`raw_payload` — the brief feature had never rendered real data end-to-end. Fixed the INSERT to the real columns (per-item display fields stored in `raw_payload` jsonb) and reshaped `loadBriefById` to project them back into the exact contract `index.tsx` consumes. **G-47** (`services/ai-gateway/src/index.ts`): `enforceCaps` + `logCall` used `requested_at` (real col `occurred_at`), `capability` (real `task`), `error_message` (real `error_code`), and inserted status `'success'`/`'failure'` into the `ai_call_status` enum whose real values are `ok`/`error`/`rate_limited`/`timeout` — every AI invoke 500'd, blocking brief item generation and prep-card warm notes. Fixed all column names + mapped status `success→ok`/`failure→error` with an `::ai_call_status` cast; updated the two gateway unit tests that asserted the old enum strings. **Live result:** `briefs/generate → ready, 3 arrivals, 1 attention`; `briefs/today → 200` (3 ranked items with say-this + callouts + James Patel's real recent issue); `prep-cards/generate → 3 cards, 3 warm notes`. | ✅ brief tsc + tests; ai-gateway tsc + 45/45; live brief+prep populated |
| `9a1906e` | CP-88 | [FEAT] | **New `/onboarding` UI wizard (the “new hotel starts from zero” flow) + G-44 brief fix — groundwork for the enterprise product-story demo.** (1) `apps/web/src/routes/onboarding.tsx`: a real 3-step setup wizard for a brand-new tenant — Step 1 create property (`POST /v1/properties`), Step 2 add first guests (`POST /v1/guests`), Step 3 generate first brief (`POST /v1/briefs/generate`), then a “your hotel is live” summary. Each step calls a live, existing API (no mocks); matches the app design system (teal `roomard-*`, `card`/`form-input`/`btn-primary`) and carries `data-testid`s for the demo to drive. Registered in `routeTree.ts`; “Set up” added to the header nav. (2) **G-44** (`services/brief/src/pipeline.ts`): the brief’s arrival query filtered on `status IN ('booked','expected','checked_in')` but the real `stay_status` enum is `confirmed,checked_in,checked_out,no_show,cancelled` — so a normal **confirmed** booking was invisible to the brief (blank home screen); it also used the `title`/`occurred_at` phantom columns (same drift as G-41) which would 500 on any arriving guest with a recent issue. Fixed to `confirmed`/`checked_in` + `summary AS title`/`raised_at`. Confirmed `prep-cards.ts` already correct. | ✅ web tsc clean + 39/39 web tests; both images rebuilt + healthy; `GET /onboarding → 200` |
| `f4852e0` | CP-87 | [TEST] | **Integration tests made idempotent + a runnable harness + an interim Stage-5 demo iteration.** (1) Fixed a real test-quality bug: the guest integration test seeded a stay with a FIXED `pms_booking_id`, which tripped the `(tenant, pms_provider, pms_booking_id)` unique constraint on the SECOND run — so it passed once then failed for anyone re-running it. Now uses a per-run booking id derived from the fresh guest id; **verified by running the full suite twice consecutively — 12/12 both times**. (2) Added `scripts/run-integration-tests.bat` so anyone can run all 12 with verbose, per-service narration. (3) Added `_session/run-integration-and-report.mjs` (orchestration) that runs the 12 integration tests against the live DB and emits a JSON result. (4) Added an **interim Stage-5** to `full-walkthrough.spec.ts` that reads that JSON and shows the real 12/12 result on screen, with a matching verify-b rubric row. **NOTE:** the Stage-5 demo approach is interim only — per user feedback it is being replaced by a proper enterprise product-story demo; the draft MP4s were NOT committed. | ✅ integration 12/12 ×2 (idempotent); Stage-5 iteration verify-a 24/24 |
| `cbf40de` | CP-85 | [FIX] | **verification-b properly aligned to the verdict-panel video + made self-explaining.** The verify-b OCR rubric still grepped the OLD narration captions (“Signed in”, “proven by coverage”, etc.) that CP-84 removed, so it reported false failures (64%). Rewrote the RUBRIC in `grade_frames_lib.py` to the text that is ACTUALLY on screen now — the BDD scene-card headers + the live verdict-panel titles/PASS badges (AUTH/DIRECTORY/PREFERENCES/TRAJECTORY/CAPTURE 404/QUEUE+AUDIT). Each rubric row is now a 3-tuple `(id, why, needles)` and `grade-frames.py` prints the `why` + the exact matched/missing needles, so the report explains every pass/fail in plain English instead of a bare code. Also densified frame sampling 1/2s → 1/1s (verdict panels dwell ≥3s, so each now lands on ≥3 frames — the sparse sampling was the real cause of flaky runs). Re-graded the committed MP4: **verification-b 13/13 = 100%**. | ✅ 13/13 |
| `1dbd7e1` | CP-84 | [FIX] | **G-41 + G-42 + G-43** (three more schema-drift production bugs, all surfaced by recording the demo for real) **+ demo “verdict panel” rework**. **G-41** guest-svc: `getPreferences` selected `confidence_calibration`/`source` (absent; real cols are `confidence`/`metadata`), `getHistory` + `analyseComplaintTrajectory` selected `occurred_at`/`title` (real cols `raised_at`/`summary`) — all three guest endpoints 500'd. **G-42** tenant-svc: `/v1/tenant` selected `legal_name` (real col `name`), `/v1/properties` (list + :id + insert) used `address_json` (absent; real cols are discrete `address_line1/2`,`city`,`postal_code`,`country_code`) — properties 500'd. **G-43** capture-svc: `/v1/captures/:id` selected `e.captured_at` (real `occurred_at`) + `c.fields_json` (real `extracted_fields`) — capture-read 500'd. All fixed by aliasing to keep response field names stable; rebuilt + live-verified (every endpoint now 200, or honest 404). **Verdict rework:** replaced the narration-only caption pills with a real in-frame test-runner panel (`showVerdict()`) — each demo stage now runs a live API assertion during recording and displays the request + the product's ACTUAL returned value + PASS/FAIL on screen. Demo re-recorded; **verification-a 24/24 green**. | ✅ live + verify-a 24/24 |
| `0fec713` | CP-83 | [FIX] | **G-39 + G-40** — two production bugs surfaced by recording the demo against the live stack (the value of doing it for real). **G-39** (exception-svc schema drift): `ExceptionRepo.list` selected `description`/`resolution_notes` but the real `exception_queue_items` columns are `detail`/`resolution` → `GET /v1/exceptions` 500'd. Fixed with `detail AS description` / `resolution AS resolution_notes` (response field names preserved) + `patch` corrected; rebuilt image; live `GET /v1/exceptions → 200`. **G-40** (web login broken in the real UI): `login.tsx` read `res.principal` but the login API returns identity under `res.user` (`{id,email,display_name,tenant_id,roles}`), so a correct sign-in did nothing — the SPA never left `/login` (this is why the demo recording's sign-in step timed out). Fixed by mapping `user → Principal`; corrected the unit test that had mocked a fictional `principal` response (which masked the bug); web build + 39/39 tests green, image rebuilt + healthy. Also fixed the **`localhost`→`127.0.0.1`** IPv6 trap across the demo `full-walkthrough.spec.ts`, verify-a spec, playwright config, and run scripts (caused the first `ERR_CONNECTION_RESET`). | ✅ live (200s) + web 39/39 |
| `4c4a0ca` | CP-82 | [DOCS] | Traceability live through CP-81 + **Roomard logo set** (`scripts/build_logo.py` → SVG mark + lockup + icon-tile, PNG exports 32/180/512/1024/lockup-1600). Records the demo/submission pipeline (CP-80), the doc rename (CP-81), and assigns CP-79 its real hash. Catches up a discipline gap where CP-80/81 were committed without their tracker rows. | ✅ |
| `44f5529` | CP-81 | [DOCS] | Renamed the 10 dated `AT-Hack0019_Claude_Roomard_*` design docs in `docs/` to the `roomard_<doctype>.md` convention (via `git mv`, 100% rename, history preserved): apispec, architecture, brd, datamodel, sprintplan, storybacklog, teststrategy, traceabilitymatrix, usecasecatalogue, usecaseflows. Updated the two references to the old names (this file-map + `build_pitch_deck.py` comment) so nothing dangles. Live operational docs (TRACEABILITY, COVERAGE_BASELINE, runbook) left unchanged. | ✅ |
| `889073e` | CP-80 | [FEAT] | Demo video + submission media pipeline, ported from the ATRIO (AT-Hack0021) sibling project and adapted to Roomard's real product/brand/routes/metrics. `demovideo/` — isolated Playwright runner, `caption-overlay.ts` (teal scene cards/pills), `full-walkthrough.spec.ts` (4 stages over the real routes: brief UC-07 → lookup+trajectory UC-08/11 → capture UC-01 → exceptions+prep UC-23/09), `creation/run-creation.ps1`, verification-a (24 hard API assertions incl. genuine 401 negative controls) + verification-b (frames→OCR rubric). `submission_media/` — `build_pitch_deck.py` (12-slide deck), `pptx_to_pdf.ps1` (PowerPoint COM + LibreOffice fallback), `build_cover_image.py` (3 covers), `build_demo_card.py`, verification-a (50 PDF assertions) + verification-b (page-render OCR). **Built + verified this session:** deck pptx→pdf (388 KB), 3 cover images, deck verification-a 50/50 + verification-b 12/12. The MP4 itself is recorded by running the documented commands against the live stack (not committed; runner needs install). | ✅ deck 50/50+12/12 |
| `eb857d3` | CP-79 | [FIX] | **G-38** (build-integrity) — the production web Docker image could not build: its Dockerfile runs `pnpm --filter @roomard/web build` = `tsc -b && vite build`, and the web `tsconfig.json` `include`d `tests`, so `tsc -b` typechecked the test files under `noUncheckedIndexedAccess`. Four real strict-null violations in `offline-queue.test.ts` (array-index + destructure access) and one `RouteOptions.path` access in `login-route.test.tsx` aborted the build (`ERR_PNPM…web build: exit 1`), blocking any `docker compose build`. Fixed properly: added `apps/web/tsconfig.build.json` (src-only) so the production bundle never typechecks tests, kept full `tsc --noEmit` (src+tests) for CI/IDE, and null-guarded the offending tests. Both `tsc -p tsconfig.build.json` and full `tsc --noEmit` exit 0; web 39/39 tests unchanged; all 11 service+web images rebuild clean. | ✅ images built |
| `5580a49` | CP-77 | [FIX] | **G-36** remediation (closes the last open issue) — RLS is FORCED on every tenant table but the app connected as the superuser/BYPASSRLS `roomard` role, so isolation was silently unenforced. Migration **0017** creates `roomard_app` (LOGIN NOSUPERUSER NOBYPASSRLS) with exactly the needed grants; REVOKEs UPDATE/DELETE on `audit_events` (append-only); production points `DATABASE_URL` at it (password via secrets manager), migrations keep using the bootstrap role. **Proven live:** as `roomard_app`, no tenant context → 0 guests, tenant 0001 → 24, empty tenant → 0. +4 db integration tests. | ✅ live PG |
| `b23764b` | CP-76 | [DOCS] | Locked the coverage baseline in `COVERAGE_BASELINE.md` (replaces the stale CP-19 version). Fresh full-workspace `test:coverage` run; every per-module % copied verbatim. Unweighted mean **87.51%** across 14 measured modules (11 ≥ 80, 6 ≥ 90); honest caveat that the statement-weighted CI aggregate isn't recomputed (text reporter only). | ✅ |
| `ec9b514` | CP-75 | [DOCS] | Traceability live through CP-74 — the mid-70s lift + a third schema-drift fix. Records CP-72 (ai-gateway 75→91%), CP-73 (auth 75→82%), CP-74 (**G-37**). Score 38 fixed, 1 invalid, 1 open. | ✅ |
| `2d13181` | CP-74 | [FIX] | **G-37** (production bug) — audit service written against an imagined `audit_events` schema (`hash`/`resource_type`/`payload_hash`/`actor_label`); real cols are `event_hash`/`resource_kind`/`detail`/`actor_display`. `SELECT hash` and `WHERE resource_type` both error against live PG — the audit query + verify-chain endpoints would 500 in production. Aligned `AuditRow`; rewrote `verifyChain` to re-derive the hash IN SQL (exact migration-0011 recipe via LAG window) so it byte-matches the trigger; `queryEvents` filter → `resource_kind`. Validated against live PG (45/45 seed chain rows verify). audit 16→19 tests. | ✅ live PG |
| `9ce873a` | CP-73 | [FEAT] | auth refresh-rotation server tests — the existing suite covered login/mfa/me/logout + refresh-401 but never the rotation success path. Added refresh-success (drives FOR UPDATE select → buildSession → issueTokensWithinTx → new-token INSERT + replaced_by UPDATE) + refresh-revoked-reuse-detection. auth 30→32 tests; **74.6→81.5%** (server.ts 63→73, service.ts 79→85). | ✅ |
| `c4d20ee` | CP-72 | [FEAT] | ai-gateway `AiGateway` facade tests — index.ts was 0% (real orchestration, not a floor). Added test-utils dep; covers provider selection (mock/override), invoke success+failure logging path, per-minute + daily cap enforcement (RateLimitError), `gatewayConfigFromEnv`. ai-gateway 37→45 tests; **75.0→91.3%** (index.ts 0→95). | ✅ |
| `f6e8e66` | CP-71 | [DOCS] | Traceability live through CP-70 — the DB-integration unblock. Records CP-69 (**G-35**) + CP-70 (**G-34** + **G-36**). All 8 db integration tests pass against live PG. Score 37 fixed, 1 invalid, 1 open. | ✅ |
| `aafa16f` | CP-70 | [FEAT] | Enable the 7 (now 8) skipped db integration tests against the live container Postgres; fix the schema drift they exposed (**G-34**) and rewrite the RLS test to genuinely verify isolation via a restricted role (**G-36**). 4 rls + 4 audit tests green with `DATABASE_URL` set; remain gated (skip cleanly) without it. | ✅ live PG |
| `58a991c` | CP-69 | [FIX] | **G-35** (production bug) — `tenant-context.applyContext` used `SET LOCAL app.x = $1` with bind params; Postgres `SET` rejects `$1` → every `withTenantContext` call would throw against real Postgres. Latent because unit tests use `createFakePool` (never parses SET). Rewrote to `SELECT set_config($1,$2,$3)`. 343 workspace tests unchanged (fake-pool compatible); validated against live PG. | ✅ live PG |
| `13c8f9a` | CP-68 | [DOCS] | Traceability live through CP-67 — finishes the apps/web lift + the api-gateway lift. Records CP-65 (captures.new + prep-cards forms, →86.6%), CP-66 (useOfflineReplay hook →100%, web →89.3%), CP-67 (api-gateway authenticated-proxy + RBAC tests, 72→79%). Workspace 328→343 tests. | ✅ |
| `303c611` | CP-67 | [FEAT] | api-gateway authenticated-proxy + RBAC server tests — added test-utils dep + `mintTestToken`; covers the authed GET proxy (x-actor-id/tenant injection), response status+header pass-through, 403 insufficient-perm, and the requireMfa 401 branch. api-gateway 14→18 tests; **72.4→79.3%** (server.ts 68.6→77.8). | ✅ |
| `f629cb9` | CP-66 | [FEAT] | apps/web `useOfflineReplay` hook tests — replay-success removes the item, replay-failure marks it, maxed-out items skipped, offline no-op. hook 0→100. web 35→39 tests; **86.6→89.3%**. Only `main.tsx` (bootstrap entry) remains — a genuine floor. | ✅ |
| `62cf234` | CP-65 | [FEAT] | apps/web captures.new + prep-cards route tests (the two heaviest forms). captures.new 3.8→91.7 (file upload, online success, offline-queue fallback on 5xx), prep-cards 2.8→93.8 (auto-select, two-tap complete, empty state). web 28→35 tests; **56.7→86.6%**. All 7 route components now 84–100%. | ✅ |
| `355c5f9` | CP-64 | [DOCS] | Traceability live through CP-63 — the apps/web route-test run. Records CP-61/62/63. Workspace 311→328 tests. apps/web 8.6→56.7%. | ✅ |
| `74d780d` | CP-63 | [FEAT] | apps/web index + guest-detail route tests + `renderRealTree` harness (real routeTree so `Route.useParams` + real `__root` render). guests.$id.tsx 0→83.6, index.tsx 0→88.5, __root.tsx 8→84, routeTree.ts →100. web 24→28 tests; **33.5→56.7%**. | ✅ |
| `6733356` | CP-62 | [FEAT] | apps/web exceptions + guests-list route tests + reusable `renderRouteComponent` harness (in-memory router + QueryClientProvider + stub paths for internal `<Link>`). exceptions.tsx 0→100 (useQuery+useMutation+tab-switch), guests.index.tsx 0→100 (debounced search). web 17→24 tests; **20.6→33.5%**. | ✅ |
| `6065e6c` | CP-61 | [FEAT] | apps/web offline-queue + login route tests — lifts the lowest module off 8.6%. offline-queue.ts 0→89 (fake-indexeddb), login.tsx 0→83.9 (memory-router render harness, real Zustand store, mocked apiFetch). web 8→17 tests; **8.6→20.6%**. | ✅ |
| `85ae4c7` | CP-59 | [FEAT] | capture object-store tests — mocked `@aws-sdk/client-s3` (`vi.hoisted`) to cover the real `ObjectStore.put`/`get` success + IntegrationError branches, `objectStoreConfigFromEnv`, and the InMemory stub. capture 4→12 tests; **75→97.8%** (object-store.ts 29→100, pipeline.ts 96.8). | ✅ |
| `78728ef` | CP-58 | [FEAT] | Deeper handler-path coverage for tenant/exception/audit servers — the CP-52 tests proved routing/RBAC but returned empty rows, leaving success bodies uncovered. Added data-returning paths: tenant POST-property-201 / dup-400 / GET-:id / GET-roles (**58.5→81.1%**); exception PATCH-success / no-fields-400 / cursor round-trip exercising encode+decode (**68.6→77.7%**); audit verify-success / export-success / export-400 (**73.4→75.7%**). +9 tests. | ✅ |
| `bb5ef95` | CP-57 | [FIX] | **G-33** logger Sentry forwarder was dead code — the pino `logMethod` hook gated on `method.name` (always `"LOG"`); pino passes the numeric level as the THIRD arg, so the `=== 'error'` check never matched and Sentry forwarding NEVER fired in any environment. Fixed to gate on `level >= 50`. +9 forwarder tests (undici mocked). logger 11→20 tests; **38.7→100%**. Found purely by chasing real coverage. | ✅ |
| `d38a866` | CP-56 | [FEAT] | auth-svc server supertests + un-excluded `server.ts` from coverage config. Real AuthService over `createFakePool` drives login/me/refresh/logout/SSO-stubs/mfa through `app.inject`, exercising the service.ts methods `service.test.ts` never reached. auth 16→30 tests; **40.1→74.6%**. (Documented the snake_case wire contract: `access_token`, `tenant_slug`, `mfa_token`.) | ✅ |
| `c8f2e13` | CP-55 | [DOCS] | Traceability live through CP-54 + **first measured coverage baseline** (replaces the long-standing ~35-45% estimate). Records CP-54 (guest/brief/ingest server supertests), workspace 250→275 tests, and a per-module measured coverage table. Every stateful service now exercises `buildServer` through HTTP. | ✅ |
| `a0af70b` | CP-54 | [FEAT] | Server-level supertests for guest/brief/ingest — extends the CP-52 `createFakePool` + `app.inject` pattern to the last three stateful services lacking HTTP-layer tests. guest 12→20, brief 17→26, ingest 21→29 (+25). ingest includes a G-27 regression guard (/health registered once) + the public HMAC-gated `/webhooks/mews` path. Lint 0/0. | ✅ |
| `a0871e1` | CP-53 | [DOCS] | Traceability live through CP-52 — records the server-level supertest coverage push and the `createFakePool` test-utils helper. Workspace 228→250 tests. No new G-issues. | ✅ |
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

## Bugs discovered & status (G-1 through G-43) — ALL CLOSED

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
| G-33 | logger Sentry forwarder was **dead code** — the pino `logMethod` hook gated forwarding on `method.name === 'error'/'fatal'`, but pino always passes `method.name === "LOG"` and supplies the numeric level as the hook's THIRD argument. So the condition never matched and the entire Sentry error-forwarding integration (built in CP-42) had never fired in any environment. Found while writing tests to lift logger off 38.7%. Fixed to gate on `level >= 50` (error=50, fatal=60). | ✅ FIXED | CP-57 |
| G-34 | DB integration tests carried **schema drift** — written against an imagined schema and never run (skipped on missing `DATABASE_URL`), so the drift was invisible. Real mismatches: tenant seed used `legal_name` (real col `name`) and tier `'starter'` (invalid; enum is `property/group_starter/group/enterprise`); audit assertions used `hash`/`resource_type` (real cols `event_hash`/`resource_kind`); `operation` for an insert is `'create'` not `'insert'`; `event_hash` is `bytea` (32 raw bytes, not 64 hex chars) so Buffer comparison needs `toStrictEqual`; request IDs were non-UUID strings but the GUC + `assertUuid` require UUIDs. All corrected to match the real schema. | ✅ FIXED | CP-70 |
| G-35 | (PRODUCTION BUG) `tenant-context.applyContext` set the per-transaction RLS/audit GUCs with `SET LOCAL app.x = $1` using **bind parameters** — but Postgres `SET`/`SET LOCAL` only accept literals, not `$1`, so every statement throws `syntax error at or near "$1"` against a real server. This means **every** `withTenantContext`/`withReadOnlyTenantContext` call (the wrapper all tenant-scoped reads/writes use) would have failed at runtime against real Postgres. Stayed latent because the entire unit suite uses `createFakePool`, which never parses SET syntax; the live login path (CP-50) worked only because `buildSession` uses raw pool queries, not the wrapper. Fixed to `SELECT set_config($1,$2,$3)` (the parameterisable function form; `is_local` mirrors SET LOCAL). The `withReadOnlyTenantContext` cleanup path already used `set_config` — this aligns the apply path with it. Surfaced only by running the db integration tests against live Postgres. | ✅ FIXED | CP-69 |
| G-36 | (SECURITY / PROVISIONING) RLS is enabled **and FORCED** on `guests` (`relrowsecurity=t, relforcerowsecurity=t`), but the app's `roomard` DB role is `rolsuper=t, rolbypassrls=t` — a superuser with BYPASSRLS **ignores RLS entirely, even under FORCE**. So in the dev/CI container, multi-tenant RLS isolation was **not actually enforced**. **Remediated CP-77:** migration 0017 creates `roomard_app` (LOGIN NOSUPERUSER NOBYPASSRLS) with exactly the grants the services need (and UPDATE/DELETE revoked on append-only `audit_events`); production connects as this role (password via secrets manager), migrations/ops keep the privileged bootstrap role. Proven live: as `roomard_app`, no tenant context → 0 guests, tenant A → only tenant-A rows, empty tenant → 0. 4 db integration tests verify the role attributes + isolation. | ✅ FIXED | CP-77 |
| G-37 | (PRODUCTION BUG) The **audit service** (`services/audit/src/service.ts`) was written against an IMAGINED `audit_events` schema — its `AuditRow`, `computeHash`, and the verify/query SQL referenced `hash`, `resource_type`, `payload_hash`, `actor_label`. The REAL columns (migration 0011) are `event_hash` (bytea), `resource_kind`, `actor_display`, `detail` (jsonb) — and there is **no** `payload_hash`. Proven against the live DB: `SELECT hash FROM audit_events` → `column "hash" does not exist`; `SELECT resource_type` → same. So the audit query endpoint (`/v1/audit/events` with a `resourceType` filter) AND the verify-chain endpoint (`/v1/audit/verify`, `/export`) would **500 in production**. Same drift class as G-34, caught the same way — checking the service code against the live schema. Fixed: aligned `AuditRow` (`event_hash`/`previous_hash` typed as `Buffer`); rewrote `verifyChain` to re-derive each row's hash **in SQL** using the exact migration-0011 `audit_compute_hash` recipe (`digest(concat_ws('|', …, occurred_at::text, encode(prev,'hex')), 'sha256')`) via a `LAG` window — doing it in SQL is the only way to byte-match Postgres's `occurred_at::text` rendering, which the old JS `toISOString()` recompute never could; `queryEvents` filter → `resource_kind`. Validated against live PG: all 45 cleanly-seeded chain rows verify (`hash_ok` + `link_ok`); the 5 that don't are this session's own integration-test rapid cross-tenant inserts with ambiguous same-timestamp ordering — a test-data artefact the verifier correctly flags, not a recipe error. | ✅ FIXED | CP-74 |

| G-38 | (BUILD-INTEGRITY) The **production web Docker image could not build**. `apps/web/Dockerfile` runs `pnpm --filter @roomard/web build` = `tsc -b && vite build`, and `apps/web/tsconfig.json` had `"include": ["src", "tests"]`, so the production typecheck compiled the **test** files — under the repo-wide `noUncheckedIndexedAccess: true`. Four genuine strict-null violations in `offline-queue.test.ts` (`all[0].id` array-index access; `[row]`/`[row2]` destructure access) plus one `childRoute.options.path` access in `login-route.test.tsx` (the property isn't on TanStack's `RouteOptions` type) aborted the build with `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … web build: exit 1`. This blocked **any** `docker compose build`, so the live stack could only ever run stale pre-fix images — which is exactly why the running containers still 500'd on the G-35 bug (they predated CP-69). Latent because `vitest` typechecks more leniently than `tsc -b` and CI ran tests, not the production image build. Fixed **properly, no scope-shrink**: added `apps/web/tsconfig.build.json` (extends the main config, `include: ["src"]`, excludes `tests`) and pointed the `build` script at it (`tsc -p tsconfig.build.json && vite build`) so the production bundle never typechecks tests; kept the full `tsc --noEmit` (src + tests) as `typecheck` for CI/IDE; and null-guarded the two offending tests. Verified: `tsc -p tsconfig.build.json` exit 0, full `tsc --noEmit` exit 0, web 39/39 tests unchanged, and all 11 service + web images rebuild clean (`BUILD_EXIT=0`). | ✅ FIXED | CP-79 |

| G-39 | (PRODUCTION BUG) **exception-svc schema drift** — `ExceptionRepo.list` (and the `patch` resolution-notes path) selected columns `description` and `resolution_notes`, but the real `exception_queue_items` table has `detail` and `resolution` (no such columns). `GET /v1/exceptions` therefore returned **500** (`column "description" does not exist`, SQLSTATE 42703) against the live DB — the entire review-queue list endpoint, broken. Same drift class as G-34/G-37, and again invisible to the unit suite (it uses `createFakePool`, which substring-matches SQL and never validates columns). Surfaced by probing the live API while recording the demo. Fixed by aliasing in SQL so the API response field names stay stable: `detail AS description`, `resolution AS resolution_notes`, and the `patch` SET clause `resolution = $n`. Verified live: `GET /v1/exceptions → 200`. | ✅ FIXED | CP-83 |
| G-40 | (PRODUCTION BUG) **web login was broken in the real UI**. `apps/web/src/routes/login.tsx` `onLogin` only proceeded `if (res.status === 'success' && res.tokens && res.principal)` and called `setPrincipal(res.principal)`. But the login API returns the identity under **`res.user`** (`{id, email, display_name, tenant_id, roles}`), not `res.principal` — so `res.principal` was always `undefined`, the branch never ran, and entering correct credentials **did nothing**: the SPA stayed on `/login` with no error. This is precisely why the demo recording's sign-in step timed out (`expect(page).not.toHaveURL(/\/login/)` failed after 12s). Critically, the unit test `on successful login…` had **mocked a fictional `{principal: …}` response** — a shape the API never returns — so it passed against a fiction and masked the bug (the same mock-drift anti-pattern as G-34/G-37). Fixed by reading `res.user` and mapping it to the store's `Principal` shape (`userId/tenantId/email/displayName/roles/permissions/mfaVerified`); corrected the unit test to mock the **real** `user` contract and assert the mapped fields, so it would now catch a regression. Verified: web `build` exit 0, **39/39** web tests pass, image rebuilt + container healthy. (The `onMfa` path still reads `res.principal`; not exercised by the demo and not proven broken — left for a follow-up once the mfa/verify response shape is confirmed against a live TOTP.) | ✅ FIXED | CP-83 |

**Score: 42 fixed, 1 invalid (G-5), 0 open.** Every functional, security, and build-integrity finding is resolved. G-39 and G-40 were found by recording the demo against the live stack — the same “no-padding, run-it-for-real” discipline that surfaced G-33/G-35/G-37: both were invisible to the mocked unit suite (one masked by a fictional mock), and both are now verified against the live API.

| G-41 | (PRODUCTION BUG) **guest-svc schema drift** — three endpoints 500'd against the live DB. `GuestRepo.getPreferences` selected `p.confidence_calibration` and `p.source` (neither exists on `preferences`; real cols include `confidence` + `metadata`). `GuestRepo.getHistory` and `analyseComplaintTrajectory` (UC-11) selected `occurred_at` and `title` from `issues` (real cols `raised_at` + `summary`). So guest preferences, stay/issue history, and the complaint-trajectory verdict all returned 500. Same drift class as G-34/37/39, same blind spot (createFakePool substring-matches SQL). Fixed by aliasing to keep API field names stable: `'heuristic' AS confidence_calibration`, `COALESCE(p.metadata->>'source','observed') AS source`, `summary AS title`, `raised_at AS occurred_at` (in SELECT, WHERE, and ORDER BY). Verified live: all three endpoints now 200. | ✅ FIXED | CP-84 |
| G-42 | (PRODUCTION BUG) **tenant-svc schema drift** — `/v1/tenant` and `/v1/properties` 500'd. `/v1/tenant` selected `legal_name` (real col `name`). `/v1/properties` (list, `:id`, and INSERT) referenced `address_json`, which does not exist — the real `properties` table stores the address in discrete columns (`address_line1`, `address_line2`, `city`, `postal_code`, `country_code`). Fixed: `name AS legal_name`; reads rebuild the old `address_json` shape via `jsonb_build_object('line1',address_line1, 'line2',address_line2, 'city',city, 'postalCode',postal_code, 'countryCode',country_code) AS address_json`; the INSERT now writes the discrete columns from `$5::jsonb->>'...'`. API response shape preserved. Verified live: `/v1/properties` and `/v1/tenant` now 200. | ✅ FIXED | CP-84 |
| G-43 | (PRODUCTION BUG) **capture-svc schema drift** — `GET /v1/captures/:evidenceId` 500'd. The query selected `e.captured_at` (the `evidence` table has `occurred_at`, not `captured_at`) and `c.fields_json` (the `card_captures` table has `extracted_fields`, not `fields_json`). Fixed: `e.occurred_at AS captured_at`, `c.extracted_fields AS fields_json` (response field names preserved). Verified live: a missing evidence id now returns a clean **404** (was 500). | ✅ FIXED | CP-84 |

**Score: 45 fixed, 1 invalid (G-5), 0 open.** Every functional, security, and build-integrity finding is resolved. G-39–G-43 (five production bugs) were all found by recording the demo against the live stack and asserting every endpoint for real — none were visible to the mocked unit suite, and all are now verified live. The demo video shows these assertions in-frame (the verdict panel), so the proof is visible, not buried in a report.

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
| 7 packages | ✅ green | ✅ 87 tests (errors 22, logger 20, schemas 32, framework 13) | ✅ 0 errors |
| 10 services | ✅ green | ✅ 230 tests (ai-gateway 45, auth 32, ingest 29, brief 26, guest 20, **audit 19**, api-gateway 18, exception 15, tenant 14, capture 12) | ✅ 0 errors |
| apps/web | ✅ green | ✅ **39 tests** | ✅ 0 errors |
| **Workspace total** | **19/19 green** | **356 passing, 0 failing** (+ 8 DB integration, `DATABASE_URL`-gated) | **0 lint errors** |

**Delta:** +13 tests across the CP-72→CP-74 mid-70s lift (ai-gateway +8 →91%, auth +2 →82%, audit +3 incl. the G-37 rewrite). Across the whole CP-56→CP-74 run, +81 tests and **three production-grade bugs** found by chasing real coverage / live-DB integration: G-33 (dead Sentry forwarder), G-35 (SET-bind-param breaks every tenant-scoped query), G-37 (audit schema drift would 500 the compliance endpoints) — plus the G-36 security finding. None were visible to the mocked unit suite.

### Measured coverage — post-lift (CP-74)

Measured via `vitest run --coverage` (v8, % statements, `src/` only). The **Was** column is the CP-55 baseline; **Now** is after the CP-56→CP-74 lift run.

| Module | Was | Now | Tests | Notes |
|---|---|---|---|---|
| logger | 38.7 | **100** | 11→20 | ↑ CP-57 (+ G-33 fix) |
| capture | 75.0 | **97.8** | 4→12 | ↑ CP-59 (object-store 29→100) |
| schemas | 98.3 | 98.3 | 32 | strong |
| brief | 95.9 | 95.9 | 26 | strong |
| errors | 93.8 | 93.8 | 22 | strong |
| **apps/web** | 8.6 | **89.3** | 8→39 | ↑ CP-61→66 (all 7 routes 84–100, stores 100, hook 100, offline-queue 89; only `main.tsx` bootstrap left) |
| ingest | 82.4 | 82.4 | 29 | good |
| guest | 81.6 | 81.6 | 20 | good |
| tenant | 58.5 | **81.1** | 10→14 | ↑ CP-58 (only `start()` left) |
| api-gateway | 72.4 | **79.3** | 14→18 | ↑ CP-67 (server.ts 77.8; only validation branch + `start()` left) |
| exception | 68.6 | **77.7** | 12→15 | ↑ CP-58 |
| audit | 73.4 | **75.1** | 14→19 | ↑ CP-58, **G-37 fixed CP-74** (verifyChain re-derives hash in SQL; flat % as that CP was a fix, not a lift) |
| auth | 40.1 | **81.5** | 16→32 | ↑ CP-56 + **CP-73** (refresh rotation; service.ts 85, server.ts 73) |
| ai-gateway | 75.0 | **91.3** | 37→45 | ↑ **CP-72** (AiGateway facade index.ts 0→95) |
| db | 3.2 | 3.2 (unit) | **8 integration** | **un-skipped CP-69/70** — 4 RLS + 4 audit pass against live Postgres (G-35 fix validated; RLS proven via restricted role per G-36). v8 line-coverage of `src/` still reads low because integration tests run as a separate `DATABASE_URL`-gated suite, but the tenant-context + RLS + audit-chain paths are now genuinely exercised end-to-end. |

*(service-framework has 13 tests but no `test:coverage` script; not measured here.)*

**What's left:** the mid-70s services (audit 75, exception 78, guest 82, ingest 82, tenant 81) have remaining branches to lift where unit-testable. The recurring **legitimate floors**, flagged honestly rather than padded: every service's `start()` (binds a port — needs a live listen), apps/web `main.tsx` (ReactDOM mount + PWA SW registration — runs only in a real browser), auth's mfa-verify success body (needs a live TOTP code), and the QianfanProvider constructor branch (needs real qianfan env). The one **open security item** is G-36: production DB provisioning must use a non-superuser, non-BYPASSRLS role or RLS is inert. 100% on the floored units isn't achievable without external infra; stated plainly rather than faked.

---

## Schema migrations

| Migration | Adds | First used by |
|---|---|---|
| 0001..0014 | Base schema (tenants, users, properties, guests, preferences, captures, briefs, exceptions, audit chain, ai_call_logs, reviews, prompts) | Initial codebase |
| **0015_review_polling.sql** | `integrations.last_polled_at` column, `direct_feedback_intake` table | CP-40 |
| **0016_prep_cards.sql** | `prep_card_status` enum, `housekeeping_prep_cards` table | CP-41 |
| **0017_app_role.sql** | `roomard_app` application DB role (LOGIN NOSUPERUSER NOBYPASSRLS) + grants; REVOKE UPDATE/DELETE on `audit_events` — the **G-36** remediation so RLS actually enforces. Paired `.down.sql`. | CP-77 |

---

## CI state (post CP-42)

Same dependency graph as documented at CP-35. Build / typecheck / lint / unit-tests / docker-build matrix all green. **Coverage is now measured, not estimated** — see the measured baseline table above. The aggregate is being lifted module-by-module toward the ≥90% gate (CP-56 onward), hardest-first.

**Post-CP-50 milestone — the login loop is verified working end to end on the live stack.** The four-layer bug cascade (G-28→G-29→G-30→G-31/G-32) is fully closed:
- `POST http://localhost:3100/v1/auth/password/login` (admin@demo.roomard.local / Roomard123! / tenant `demo`) → **200**, `status: success`, a real 317-char HS256 JWT `access_token` + `refresh_token` + expiries.
- `GET http://localhost:3100/v1/auth/me` with `Authorization: Bearer <token>` → **200**, returns the authenticated user + tenant slug. Proves the full issue→verify→RBAC→tenant-resolution loop.
- `POST http://localhost:8180/api/v1/auth/password/login` (the browser-facing nginx route, which rewrites `/api/` → `/` and proxies to `api-gateway:3000`) → **200** + JWT. This confirms G-24 (nginx 502) is resolved.
- **15/15 containers healthy** with all CP-37..CP-50 code integrated; database provisioned with 16 migrations + seed.

**Key learning:** unit tests with mocked undici could not have caught G-29 (needs a real client sending `expect`) or G-30 (needs the real gateway→upstream path). The live-stack smoke test earned its keep. Cross-service path-prefix mismatches like G-30, and schema/code contract mismatches like G-32, are invisible to per-service unit tests — only an integration test through the actual gateway against a real DB catches them. The coverage roadmap (CP-52+) prioritises exactly this gap.

---

## Roadmap

All functional bugs are closed and the login loop is verified live. Remaining work is the coverage lift toward the ≥90% gate, attacking the measured gaps hardest-first.

| CP | Target | Effort | Status |
|---|---|---|---|
| CP-52 | exception, audit, tenant server.ts supertests | L | ✅ DONE (+22) |
| CP-54 | guest, brief, ingest server.ts supertests | M | ✅ DONE (+25) |
| CP-56 | auth server.ts supertests + un-exclude server.ts from coverage | M | ✅ DONE (40→75%) |
| CP-57 | logger Sentry HTTP-forward path tests (+ G-33 fix) | S | ✅ DONE (39→100%) |
| CP-58 | tenant + exception + audit deeper handler-path coverage | M | ✅ DONE |
| CP-59 | capture object-store — mock S3 client tests | S | ✅ DONE (75→98%) |
| CP-61 | apps/web — offline-queue + login route (memory-router harness) | M | ✅ DONE (8.6→20.6%) |
| CP-62 | apps/web — exceptions + guests-list routes (reusable harness) | M | ✅ DONE (→33.5%) |
| CP-63 | apps/web — index + guest-detail routes (real-tree harness) | M | ✅ DONE (→56.7%) |
| CP-65 | apps/web — captures.new + prep-cards forms | M | ✅ DONE (→86.6%) |
| CP-66 | apps/web — useOfflineReplay hook | S | ✅ DONE (→89.3%) |
| CP-67 | api-gateway — authenticated-proxy + RBAC server tests | M | ✅ DONE (72→79%) |
| CP-69 | **G-35** production fix — `applyContext` SET-bind-param bug | S | ✅ DONE (live PG) |
| CP-70 | db integration enablement — G-34 schema drift + G-36 RLS rewrite | M | ✅ DONE (8/8 db tests) |
| CP-72 | ai-gateway `AiGateway` facade tests (index.ts 0→95) | M | ✅ DONE (75→91%) |
| CP-73 | auth refresh-rotation server tests | S | ✅ DONE (75→82%) |
| CP-74 | **G-37** audit schema-drift production fix (verifyChain → SQL recompute) | M | ✅ DONE (live PG) |
| CP-76 | Lock the measured baseline in `COVERAGE_BASELINE.md` | S | ✅ DONE (mean 87.51%) |
| CP-77 | **G-36** remediation — migration 0017 `roomard_app` NOSUPERUSER NOBYPASSRLS role so RLS enforces | M | ✅ DONE (live PG) |
| CP-78 | (optional) lift the remaining mid-70s unit-testable branches — exception/guest/ingest/audit | M | optional |
| CP-79 | **G-38** build-integrity fix — web production image (`tsconfig.build.json` src-only) so `docker compose build` succeeds; all 11 images rebuilt | S | ✅ DONE (images built) |

**All G-issues are now closed** (40 fixed, 1 invalid, 0 open). The remaining roadmap is optional coverage polish + the externally-gated deferred items below.

Optional live-stack hardening (not blocking coverage): a one-shot DB-migrate init container or compose `depends_on` hook so a fresh `docker compose up` provisions the schema automatically (today G-31 requires a manual `migrate`+`seed` run). **Also:** migration 0017 creates the `roomard_app` role, but the docker-compose service env still points `DATABASE_URL` at the bootstrap `roomard` superuser — a follow-up should switch the *service* containers to `roomard_app` (keeping migrate/seed on the privileged role) so the live stack exercises RLS exactly as production will. The G-36 *fix* (the role + grants + proof) is done; this is the compose-wiring follow-through.

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
| `docs/roomard_*.md` | 10 design docs (CP-36; renamed from `AT-Hack0019_Claude_Roomard_*` to `roomard_<doctype>.md` at CP-81) |
| `docs/COVERAGE_BASELINE.md` | Honest coverage state |
| `docs/TRACEABILITY.md` | THIS FILE — live record per CP |
| `docs/adr/` | Architecture decision records |
| `_backup/` | FILE BACKUP RULE compliance — every edited file pre-backed-up |
| `_session/` | **GITIGNORED** — transient local validation artefacts |
