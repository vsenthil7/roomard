# Roomard — Live Traceability Matrix

**Purpose:** Live, updated-every-CP record of requirements → use cases → stories → code → tests → commit. Per CLAUDE_RULES this lives in `docs/` and is committed alongside every CP.

**Last updated:** 2026-05-20 00:18 BST (CP-34)
**Live source of truth:** `origin/main` on https://github.com/vsenthil7/roomard

---

## Session 002-02-H19-Build (2026-05-18 ~15:02 BST onwards)

### Commits landed (newest → oldest, 36 total since session start)

| Commit | CP | Type | Summary | Verified |
|---|---|---|---|---|
| `9d395fe` | CP-34 | [FIX] | G-23 docker-compose ai-gateway DATABASE_URL was missing — compose comment claimed ai-gateway needed no DB but code unconditionally calls `dbConfigFromEnv` for the `ai_call_logs` table (rate-limit + audit). Added `*depends-data` and `*env-db` anchors + `AI_GATEWAY_MOCK=true` so mock provider activates without Qianfan creds. | ✅ ai-gateway healthy in 25s |
| `87ae1c6` | CP-33 | [FIX] | G-21/G-22 all 10 service Dockerfiles migrated to `pnpm deploy` pattern — `pnpm install --prod --filter ./services/X...` silently dropped transitive workspace-package deps (`pg` from `@roomard/db`, `jose` from `@roomard/service-framework`) causing 8 of 10 services to restart-loop with ERR_MODULE_NOT_FOUND. `pnpm --filter @roomard/X deploy --prod /deploy` produces a self-contained bundle with the full prod dep closure. Also gitignored `_session/` for transient validation artefacts. | ✅ all 10 services healthy locally |
| `ba6a581` | CP-32 | [FIX] | G-20 all 10 service Dockerfile healthchecks now use `127.0.0.1` instead of `localhost` — Node 20 binds dualstack but Alpine BusyBox wget against `localhost` was failing IPv4 lookup so containers reported unhealthy even while serving 200s to host port. Ingest had been missed in the gap edits batch, picked up here. | ✅ auth-svc healthy in 5s |
| `ea5c51c` | CP-31 | [FIX] | G-19 auth-svc bcryptjs named import crashed at runtime — `import { compare } from 'bcryptjs'` rejected by Node 20 ESM loader because bcryptjs@2.x is CJS without proper named-export interop. Vitest passed because esbuild does CJS interop differently from Node runtime. Changed to default-import + destructure pattern. | ✅ container reaches app.listen |
| `4946d7d` | CP-30 | [FIX] | G-18 all 10 service Dockerfiles — `EXPOSE` port now matches service-internal listener and healthcheck uses correct env var. Was hardcoded `EXPOSE 3000` + `${PORT:-3000}` fallback that only api-gateway accidentally hit right. | ✅ |
| `eaafbb0` | CP-29 | [CI] | Decoupled docker-build/security-scan/e2e from honest coverage failure — coverage-gate extracted as its own job (`needs unit-tests`) so a coverage shortfall surfaces as isolated red signal not a cascading skip. `docker-build` now depends only on `lint-typecheck`. `e2e` depends on `unit-tests + docker-build`. `security-scan` depends on `lint-typecheck + docker-build`. Replaced glob package with native fs walk. | ✅ docker-build matrix ran for first time |
| `db40f31` | CP-28 | [FEAT] | G-3 docker-compose wires all 11 application services (api-gateway, auth, tenant, guest, capture, brief, exception, audit, ai-gateway, ingest, web). Host ports remapped to 31xx, 8180, 5532, 6479, 9100 to avoid MendoraCI clash. Shared JWT/DATABASE_URL/upstream URLs via env anchors. `depends_on` with healthy gates for data plane. Nginx proxies `/api` to api-gateway with 25m body limit and X-Forwarded headers. | ✅ `docker compose config --quiet` passes |
| `46b2ec6` | CP-27 | [FIX] | G-3 prep — 10 service Dockerfiles cleaned, removed fragile `2>/dev/null` build-line fallback that masked errors and used a dead `-svc-or-not` filter. Each Dockerfile now invokes its canonical package name directly. | ✅ |
| `669edbf` | CP-26 | [DOCS] | Traceability live through CP-25 — 17 G-issues 16 fixed 1 invalid 1 open. Coverage lift roadmap CP-26..CP-34. | ✅ |
| `94b6284` | CP-25 | [FIX] | G-17 lint cleanup — 11 files top-level `import type` + plugin.ts canonical 404 envelope + auth `jwtVerify` hoist out of dynamic-import hot path + gitignore web-e2e/reports | ✅ 0 lint errors, 121 tests pass |
| `e384911` | CP-24 | [FIX] | G-17 audit `/verify` endpoint — replaced unvalidated query cast with `VerifyQuerySchema(IsoDateTimeSchema)` + ValidationError + canonical envelope | ✅ |
| `8d71683` | CP-23 | [FIX] | G-17 api-gateway — route-not-found now throws NotFoundError (canonical envelope) + removed unused `z` | ✅ |
| `0d8e049` | CP-22 | [FIX] | G-17 errors test — added 6 RoomardError base-class tests (16→22) covering default category, cause propagation, status override, toJSON, name preservation | ✅ |
| `ccb2978` | CP-21 | [FIX] | Lint auto-fix across 66 files via `pnpm run lint:fix` (import-order reflow) | ✅ |
| `65b2730` | CP-20 | [DOCS] | Honest coverage baseline + traceability through CP-19 | ✅ |
| `e6fe6d6` | CP-19 | [FIX] | G-16 tenant-svc adds `jose` as devDep | ✅ |
| `ab23938` | CP-18 | [FIX] | G-15 Authentication/Authorization/ServiceUnavailableError — single-string regression from CP-9 fixed | ✅ |
| `e09b19b` | CP-17 | [FIX] | G-11 apps/web — 6 routes `createFileRoute`→`createRoute` programmatic, 26 TS errors resolved | ✅ |
| `3f07e4e` | CP-16 | [FIX] | G-14 api-gateway — broken `Parameters<>` typedef, `err.status` (not statusCode), `rawBody` removed, AuthPrincipal.mfaVerified added | ✅ |
| `a93af78` | CP-15 | [FIX] | G-13 TenantContext.actorLabel field + ingest duplicate `status` key → `ingestStatus` | ✅ |
| `1034449` | CP-14 | [FIX] | G-12 services/guest adds `undici` dep | ✅ |
| `45246e1` | CP-13 | [DOCS] | Traceability update through CP-12 | ✅ |
| `83a00a7` | CP-12 | [FIX] | G-9 ServiceUnavailableError widened to accept details object | ✅ |
| `aa8a329` | CP-11 | [FIX] | G-8 plugin.ts `ip`→`ipInet` + userAgent narrowing | ✅ |
| `89d7f78` | CP-10 | [FIX] | G-7 service-framework adds `pg` + `@types/pg` | ✅ |
| `d599a63` | CP-9 | [FIX] | G-6 Authentication/AuthorizationError flexible signature (had regression — fixed CP-18) | ⚠️→✅ |
| `7272958` | CP-8 | [FIX] | typecheck `tsc -b --noEmit` → `tsc --noEmit` + build-before-typecheck in CI | ✅ |
| `b5dc226` | CP-7 | [DOCS] | First traceability matrix | ✅ |
| `96b3573` | CP-6 | [DOCS] | First honest coverage baseline | ✅ |
| `31c43db` | CP-5 | [FIX] | RoomardPool constructor `pg.Pool \| DbConfig` | ✅ |
| `0aeb2df` | CP-4 | [FIX] | logger pino `stdSerializers`/`stdTimeFunctions` named imports | ✅ |
| `d133654` | CP-3 | [FIX] | 11 test files `../src/`→`../../src/` import bug sweep | ✅ |
| `29a4181` | CP-2 | [FIX] | schemas test imports + email max off-by-one | ✅ |
| `9ddc54f` | CP-1 | [FIX] | CI coverage gate `\|\| true` removed + pnpm 9.15.9 sync | ✅ |
| `419bb9d` | (init) | [INIT] | Roomard codebase from tarball (135KB, 206 files) | baseline |

### Commits rewritten/dropped from history

| Old SHA | Reason |
|---|---|
| `54b7133` | Bundled CP-0+CP-1 (violated GIT COMMIT DISCIPLINE). Split per user instruction. |
| `a3b228b` | "0% coverage" baseline doc that was misleading. Replaced by CP-6's truthful baseline, then again by COVERAGE_BASELINE.md v2 in CP-19. |

### Discipline lapses to acknowledge

Between CP-26 (19:42 BST) and the start of this update (00:18 BST), the working tree was dirty for multiple bursts without traceability updates. Specifically: CP-27 through CP-32 landed without doc updates (caught up retroactively at CP-34), and CP-33/CP-34 themselves were on disk uncommitted while local validation continued. User flagged at 00:18 BST and CP-33/CP-34 were committed-and-pushed immediately. **Going forward: every CP commit-pushes AND updates this doc in the same logical unit.**

---

## Bugs discovered & status (G-1 through G-23)

| ID | Description | Status | Fix CP |
|---|---|---|---|
| G-1 | CI coverage gate silently passing via `\|\| true` | ✅ FIXED | CP-1 |
| G-2 | pnpm version mismatch (CI 9.12.0 vs local 9.15.9) | ✅ FIXED | CP-1 |
| G-3 | docker-compose lacks service blocks | ✅ FIXED | CP-27+CP-28 |
| G-4 | Brace-expansion cruft dirs from tarball extract | ✅ FIXED | folded into CP-3 |
| G-5 | False alarm: 17/19 packages claimed no test:coverage script | ❌ INVALID | — |
| G-6 | AuthenticationError constructor signature mismatch | ✅ FIXED | CP-9, refined CP-18 |
| G-7 | service-framework missing `pg` module | ✅ FIXED | CP-10 |
| G-8 | TenantContext `'ip'` field mismatch (should be `ipInet`) | ✅ FIXED | CP-11 |
| G-9 | ai-gateway 3 TS2554 on ServiceUnavailableError | ✅ FIXED | CP-12 |
| G-10 | schemas email-max test off-by-one (319 vs 320 chars) | ✅ FIXED | CP-2 |
| G-11 | apps/web TanStack Router 26 type errors | ✅ FIXED | CP-17 |
| G-12 | services/guest missing `undici` dep | ✅ FIXED | CP-14 |
| G-13 | TenantContext missing `actorLabel` + ingest `status` duplicate key | ✅ FIXED | CP-15 |
| G-14 | api-gateway broken `Parameters<>` typedef + AuthPrincipal.mfaVerified missing + err.status vs statusCode + rawBody invalid | ✅ FIXED | CP-16 |
| G-15 | CP-9 widening regression: single-string callers got default message | ✅ FIXED | CP-18 |
| G-16 | tenant-svc test imports `jose` but pkg never declared the dep | ✅ FIXED | CP-19 |
| G-17 | Hundreds of lint errors (import/order + import() types + unused imports) | ✅ FIXED | CP-21 (bulk) + CP-22/23/24/25 (manual + enterprise fixes) |
| G-18 | 10 service Dockerfiles wrong `EXPOSE 3000` + broken `${PORT:-3000}` healthcheck | ✅ FIXED | CP-30 |
| G-19 | auth-svc bcryptjs CJS named import crashed Node 20 ESM loader at runtime | ✅ FIXED | CP-31 |
| G-20 | Container `(unhealthy)` despite service serving — BusyBox wget against `localhost` not resolving IPv4 loopback under dualstack bind | ✅ FIXED | CP-32 |
| G-21 | ai-gateway / api-gateway `Cannot find package 'pg'` from `packages/db/dist/pool.js` — runtime install dropped transitive workspace dep | ✅ FIXED | CP-33 |
| G-22 | 6 services `Cannot find package 'jose'` from `packages/service-framework/dist/auth.js` — same transitive-dep dropping under `pnpm install --prod --filter` | ✅ FIXED | CP-33 |
| G-23 | ai-gateway `DatabaseError: DATABASE_URL is required` — compose lacked DB env for ai-gateway even though code uses `ai_call_logs` table | ✅ FIXED | CP-34 |

**Score: 22 fixed, 1 invalid, 0 open.**

### Real-stack validation milestone (00:10 BST)

After CP-33 + CP-34 were applied locally, `docker compose up -d` brought up **ALL 15 containers HEALTHY** for the first time this session:
- 4 infra (postgres, redis, minio, mailpit) — healthy
- 10 services (auth, tenant, guest, capture, brief, exception, audit, ai-gateway, api-gateway, ingest) — healthy
- 1 web (nginx) — healthy

Direct healthchecks pass on each service's host-mapped port. End-to-end through web's nginx proxy is not yet verified — see G-24 below.

### Open findings not yet ticketed as G-issues

| ID | Description | Status |
|---|---|---|
| G-24 | `curl http://localhost:8180/api/health` returns **502 Bad Gateway** through web nginx → api-gateway. Direct api-gateway call (`http://localhost:3100/health`) works. Likely nginx `proxy_pass` config or Docker DNS resolution on the bridge network. Not yet investigated. | ❌ OPEN — next CP |

---

## Build, test, and lint state

| Layer | Build | Tests | Lint |
|---|---|---|---|
| All 7 packages | ✅ green | ✅ 65 tests pass (errors 22, logger 4, schemas 32, framework 7) | ✅ 0 errors |
| All 10 services | ✅ green | ✅ 54 tests pass | ✅ 0 errors |
| apps/web | ✅ green | ✅ 8 tests pass | ✅ 0 errors |
| **Workspace total** | **19/19 green** | **127 passing, 0 failing, 7 skipped** | **0 lint errors** |

Coverage aggregate ~35-45% — honest, well below the 90% CI gate. Coverage lift roadmap below.

---

## CI state (post CP-34)

CI dependency graph after CP-29's redesign:

| Job | Depends on | Last status |
|---|---|---|
| `lint-typecheck` | (root) | ✅ green since CP-25 |
| `unit-tests` | (root) | ✅ green since CP-19 |
| `coverage-gate` | unit-tests | ❌ honestly fails at ~35-45% vs 90% gate |
| `integration-tests` | (root) | ❌ MinIO container init issue (CI infra, not our code) |
| `docker-build` (matrix × 10) | lint-typecheck | ✅ all 10 matrix legs green since CP-29+CP-30 |
| `e2e-tests` | unit-tests + docker-build | ❌ failed at `Start stack via docker compose` pre-CP-33; expected to pass after CP-33+CP-34 |
| `security-scan` (ZAP) | lint-typecheck + docker-build | ❌ same `Start stack` failure pre-CP-33 |

Build / typecheck / lint / unit-tests / docker-build matrix all green. The only red signals are honest:
- coverage gate (real work in CP-35+)
- MinIO init (CI runner infra, separate ticket)
- ZAP + Playwright `Start stack` (pre-CP-33 cause was G-21/G-22; rerun pending after CP-33+CP-34 verification)

---

## Coverage lift + remaining work roadmap (CP-35+)

| CP | Target | Effort | Lift |
|---|---|---|---|
| CP-35 | G-24 — nginx → api-gateway 502 Bad Gateway through web container | S | unblocks SPA |
| CP-36 | End-to-end smoke through stack (login → /v1/auth/password/login) | S | proves real chain works |
| CP-37 | apps/web — 1 test per route (Login, Brief, Captures, Guests, Exceptions) | M | 10.68% → ~50% |
| CP-38 | api-gateway server.ts — supertest + mocked upstreams | M | 23% → ~70% |
| CP-39 | exception, audit, tenant, ingest server.ts — supertest pattern | L | each ~25-50% → ~80% |
| CP-40 | auth — MFA, refresh, password change paths | M | 33% → ~80% |
| CP-41 | ai-gateway — qianfan-provider tests with mocked Qianfan API | M | 30% → ~75% |
| CP-42 | capture object-store — mock S3 client tests | S | 75% → ~90% |
| CP-43 | db — `docker compose up postgres` in test setup, unblock 7 skipped integration tests | M | unblocks 7 tests |
| CP-44 | Re-run, verify aggregate ≥90%, declare baseline locked | S | gate green |

---

## Open decisions awaiting user

| ID | Question | Recommendation |
|---|---|---|
| D-1 | After CP-34, prioritise G-24 (502 fix) or jump to coverage lift? | G-24 first — full stack working end-to-end is the gating proof |
| D-2 | Coverage strategy: route-tests via supertest, OR tune gate down to honest level, OR per-package floors + aggregate target? | Per-package floors (75% min) + aggregate 90% target |
| D-3 | Force-push policy going forward | Treat as immutable — 36 commits on origin, history is frozen |
| D-4 | Should ai-gateway transitively log via audit-svc instead of writing `ai_call_logs` directly? Current design has both ai-gateway and audit-svc as DB writers. | Out of scope for this session — note for design review |

---

## File map maintained

| Path | Purpose |
|---|---|
| `docs/COVERAGE_BASELINE.md` | Honest coverage state (v2) |
| `docs/TRACEABILITY.md` | THIS FILE — live record per CP |
| `_backup/` | FILE BACKUP RULE compliance — every edited file pre-backed-up |
| `_session/` | **GITIGNORED** as of CP-33 — transient local validation artefacts |
