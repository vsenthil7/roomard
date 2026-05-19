# Roomard — Live Traceability Matrix

**Purpose:** Live, updated-every-CP record of requirements → use cases → stories → code → tests → commit. Per CLAUDE_RULES this lives in `docs/` and is committed alongside every CP.

**Last updated:** 2026-05-19 16:45 BST (CP-19)
**Live source of truth:** `origin/main` on https://github.com/vsenthil7/roomard

---

## Session 002-02-H19-Build (2026-05-18 ~15:02 BST onwards)

### Commits landed (newest → oldest, 22 total since session resume)

| Commit | CP | Type | Summary | Verified |
|---|---|---|---|---|
| `e6fe6d6` | CP-19 | [FIX] | G-16 tenant-svc adds `jose` as devDep | ✅ 3 tests pass |
| `ab23938` | CP-18 | [FIX] | G-15 Authentication/Authorization/ServiceUnavailableError — single-string regression from CP-9 fixed | ✅ auth-svc 5/5 pass |
| `e09b19b` | CP-17 | [FIX] | G-11 apps/web — 6 routes converted `createFileRoute`→`createRoute` programmatic, 26 TS errors resolved | ✅ full workspace builds clean |
| `3f07e4e` | CP-16 | [FIX] | G-14 api-gateway — broken `Parameters<>` typedef, `err.status` (not statusCode), `rawBody` removed, AuthPrincipal.mfaVerified added | ✅ builds |
| `a93af78` | CP-15 | [FIX] | G-13 TenantContext.actorLabel field + ingest duplicate `status` key → `ingestStatus` | ✅ builds |
| `1034449` | CP-14 | [FIX] | G-12 services/guest adds `undici` dep | ✅ builds |
| `45246e1` | CP-13 | [DOCS] | Traceability update through CP-12 | ✅ pushed |
| `83a00a7` | CP-12 | [FIX] | G-9 ServiceUnavailableError widened to accept details object | ✅ ai-gateway builds |
| `aa8a329` | CP-11 | [FIX] | G-8 plugin.ts `ip`→`ipInet` + userAgent narrowing | ✅ service-framework builds |
| `89d7f78` | CP-10 | [FIX] | G-7 service-framework adds `pg` + `@types/pg` | ✅ pg resolves |
| `d599a63` | CP-9 | [FIX] | G-6 Authentication/AuthorizationError flexible signature (had regression — see CP-18) | ⚠️ regression discovered, fixed in CP-18 |
| `7272958` | CP-8 | [FIX] | typecheck `tsc -b --noEmit` → `tsc --noEmit` + build-before-typecheck in CI | ✅ |
| `b5dc226` | CP-7 | [DOCS] | First traceability matrix | ✅ |
| `96b3573` | CP-6 | [DOCS] | First honest coverage baseline (later rewritten in COVERAGE_BASELINE.md) | ✅ |
| `31c43db` | CP-5 | [FIX] | RoomardPool constructor `pg.Pool \| DbConfig` | ✅ |
| `0aeb2df` | CP-4 | [FIX] | logger pino `stdSerializers`/`stdTimeFunctions` named imports | ✅ |
| `d133654` | CP-3 | [FIX] | 11 test files `../src/`→`../../src/` import bug sweep | ✅ |
| `29a4181` | CP-2 | [FIX] | schemas test imports + email max off-by-one | ✅ 32/32 pass |
| `9ddc54f` | CP-1 | [FIX] | CI coverage gate `\|\| true` removed + pnpm 9.15.9 sync | ✅ pushed |
| `419bb9d` | (init) | [INIT] | Roomard codebase from tarball (135KB, 206 files) | baseline |

### Commits rewritten/dropped from history

| Old SHA | Reason |
|---|---|
| `54b7133` | Bundled CP-0+CP-1 (violated GIT COMMIT DISCIPLINE). Split per user instruction. |
| `a3b228b` | "0% coverage" baseline doc that was misleading. Replaced by CP-6's truthful baseline, then again by COVERAGE_BASELINE.md v2 in CP-19. |

---

## Bugs discovered & status (G-1 through G-16)

| ID | Description | Status | Fix CP |
|---|---|---|---|
| G-1 | CI coverage gate silently passing via `\|\| true` | ✅ FIXED | CP-1 |
| G-2 | pnpm version mismatch (CI 9.12.0 vs local 9.15.9) | ✅ FIXED | CP-1 |
| G-3 | docker-compose lacks service blocks (10 services + web not containerised) | ❌ OPEN | (CP-28 proposed) |
| G-4 | Brace-expansion cruft dirs from tarball extract | ✅ FIXED | folded into CP-3 history |
| G-5 | False alarm: claimed 17/19 packages had no test:coverage script | ❌ INVALID | — |
| G-6 | AuthenticationError constructor signature mismatch | ✅ FIXED | CP-9, refined CP-18 |
| G-7 | service-framework missing `pg` module | ✅ FIXED | CP-10 |
| G-8 | TenantContext `'ip'` field mismatch (should be `ipInet`) | ✅ FIXED | CP-11 |
| G-9 | ai-gateway 3 TS2554 on ServiceUnavailableError | ✅ FIXED | CP-12 |
| G-10 | schemas email-max test off-by-one (319 vs 320 chars) | ✅ FIXED | CP-2 |
| G-11 | apps/web TanStack Router 26 type errors (createFileRoute needs codegen) | ✅ FIXED | CP-17 |
| G-12 | services/guest missing `undici` dep | ✅ FIXED | CP-14 |
| G-13 | TenantContext missing `actorLabel` + ingest `status` duplicate key | ✅ FIXED | CP-15 |
| G-14 | api-gateway broken `Parameters<>` typedef + AuthPrincipal.mfaVerified missing + err.status vs err.statusCode + rawBody config invalid | ✅ FIXED | CP-16 |
| G-15 | CP-9 widening regression: single-string callers got default 'Authentication required' instead of their message | ✅ FIXED | CP-18 |
| G-16 | tenant-svc test imports `jose` but pkg never declared the dep | ✅ FIXED | CP-19 |

**Score: 14 fixed, 1 invalid, 1 open.**

---

## Build & test state

| Layer | Build | Tests | Coverage |
|---|---|---|---|
| All 7 packages | ✅ green | ✅ 59 tests pass | logger 100%, schemas 98%, errors 92%, db (integ-skipped) |
| All 10 services | ✅ green | ✅ 54 tests pass | brief 91%, guest 76%, capture 75%, ingest 50%, exception 47%, auth 33%, ai-gateway 30%, tenant 25%, audit 25%, api-gateway 23% |
| apps/web | ✅ green | ✅ 8 tests pass | 10.68% |
| **Workspace total** | **19/19 green** | **121 passing, 0 failing, 7 skipped** | aggregate ~35-45% (below 90% gate, honestly) |

---

## CI state

Last 5 CI runs (all on `main`): all failed pre-CP-17 due to G-11 build errors in apps/web blocking the whole `pnpm run build` step. Next push after CP-17/18/19 should pass build + lint + typecheck, but **will fail at the 90% coverage gate** because the gate is real (CP-1) and we're at ~35-45% honestly.

This is the right truth-telling — fail honestly rather than pass dishonestly.

---

## Open decisions awaiting user

| ID | Question | Default |
|---|---|---|
| D-1 | Continue lifting coverage (CP-20+) or stop and let user direct next? | Stop after CP-19, wait for direction |
| D-2 | Coverage strategy: route-tests via supertest, OR tune gate down to honest level, OR per-package floors + aggregate target? | Recommend per-package floors (75% min) + aggregate 90% target |
| D-3 | Docker for services (G-3): now or later? Port-conflicts with MendoraCI still on 5432/6379/9000/9001 | Defer to next session |

---

## File map maintained

| Path | Purpose |
|---|---|
| `_session/SESSION_LOG.md` | Human-readable timeline |
| `_session/AUDIT_001_20260518_1514.md` | Initial enterprise-grade audit |
| `docs/COVERAGE_BASELINE.md` | Honest coverage state (v2) |
| `docs/TRACEABILITY.md` | THIS FILE — live record per CP |
| `_session/logs/` | All bootstrap and run logs |
| `_backup/` | FILE BACKUP RULE compliance — every edited file pre-backed-up |
