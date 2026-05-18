# Roomard — Live Traceability Matrix

**Purpose:** Live, updated-every-CP record of requirements → use cases → stories → code → tests → commit. Per CLAUDE_RULES this lives in `docs/` and is committed alongside every CP.

**Last updated:** 2026-05-18 15:51 BST (CP-6)  
**Live source of truth:** `origin/main` on https://github.com/vsenthil7/roomard

---

## Session 002-02-H19-Build (2026-05-18 ~15:02 BST onwards)

### Commits landed this session (newest → oldest)

| Commit | CP | Type | Summary | Files changed | Verified |
|---|---|---|---|---|---|
| `96b3573` | CP-6 | [DOCS] | Honest coverage baseline + remaining G-issues inventory | 4 (+9672 lines) | ✅ pushed |
| `31c43db` | CP-5 | [FIX] | `RoomardPool` constructor accepts `pg.Pool` OR `DbConfig` | 2 | ✅ `pnpm --filter @roomard/db build` clean |
| `0aeb2df` | CP-4 | [FIX] | logger pino `stdSerializers`/`stdTimeFunctions` named-import fix | 2 | ✅ `pnpm --filter @roomard/logger build` clean |
| `d133654` | CP-3 | [FIX] | Sweep `../src/` → `../../src/` across 11 test files | 22 | ✅ all test files load (further tests pending build fixes) |
| `29a4181` | CP-2 | [FIX] | schemas test imports + email off-by-one | 1 | ✅ 32/32 tests pass, 98.31% coverage |
| `9ddc54f` | CP-1 | [FIX] | CI coverage gate `\|\| true` removed + pnpm 9.15.9 sync | 4 | ✅ pushed; will validate on next CI run |
| `419bb9d` | (init) | [INIT] | Roomard codebase from tarball (135KB, 206 files) | 207 | baseline |

### Commits previously on origin but rewritten/dropped

| Old SHA | Reason |
|---|---|
| `54b7133` | Bundled CP-0+CP-1 (violated GIT COMMIT DISCIPLINE — one logical unit per commit). Split per user instruction. |
| `a3b228b` | "0% coverage" baseline doc that was misleading. Replaced by CP-6's truthful baseline. |

---

## Bugs discovered & fixed (Gxx tracking)

| ID | Description | Status | Fix CP | Notes |
|---|---|---|---|---|
| G-1 | CI coverage gate silently passing via `\|\| true` | ✅ FIXED | CP-1 | Real silent-pass dishonesty pattern, exactly the kind CLAUDE_RULES SCOPE-DRIFT GUARDS warns about |
| G-2 | pnpm version mismatch (CI 9.12.0 vs local 9.15.9 vs lockfile) | ✅ FIXED | CP-1 | Bumped across env + 5 action-setup blocks + packageManager field |
| G-3 | docker-compose is infra-only (10 services + web not in compose) | ❌ OPEN | CP-10+ | Per user requirement "everything need to be in docker." Larger CP. |
| G-4 | Brace-expansion cruft dirs from tarball extract | ✅ FIXED | CP-0 (now folded into CP-3 history) | `apps/web/{src/` and `apps/web-e2e/{tests,fixtures}/` were empty leaves, git never tracked them |
| G-5 | False alarm — claimed "17 of 19 packages have no test:coverage script" | ❌ INVALID | — | Re-counted: 15 of 19 DO have it. Original CP-2 baseline run failed because of pnpm `--bail` killing the queue after schemas crash, not missing scripts. Corrected in CP-6 doc. |
| G-6 | `AuthenticationError` constructor signature mismatch (`(code, message)` vs callers passing `(message, { reason })`) | ❌ OPEN | CP-7 | Systemic across `auth/service.ts`, `service-framework/src/auth.ts`. Same shape as `ConflictError`/`IntegrationError` fix pattern. |
| G-7 | `service-framework/src/plugin.ts` cannot find `pg` module | ❌ OPEN | CP-8 | Missing `pg` + `@types/pg` in service-framework's package.json |
| G-8 | `'ip'` field not on `TenantContext` type | ❌ OPEN | CP-9 | Either add to interface or remove from call site |
| G-9 | ai-gateway `mock-provider.ts:23` + `qianfan-provider.ts:53,100` — 2 args, expected 0-1 | ❌ OPEN | CP-10 | 3 call sites |
| G-10 | schemas test had email-max off-by-one (test data 319 chars, schema max 320) | ✅ FIXED | CP-2 | Test data changed from `'a'.repeat(311)` to `'a'.repeat(313)` |

---

## Verified coverage state (per package)

| Package | Tests pass | Stmts % | Notes |
|---|---|---|---|
| `@roomard/errors` | 16/16 ✅ | 96.29% | Uncovered: lines 177, 179, 183, 196-198 |
| `@roomard/logger` | 4/4 ✅ | 100% | Fully covered |
| `@roomard/schemas` | 32/32 ✅ | 98.31% | Only `index.ts` barrel uncovered |
| `@roomard/web` | 8/8 ✅ | 10.83% | Routes/hooks untested |
| `@roomard/db` | needs build | — | Integration tests need built `dist/` of dependent packages |
| Services × 10 | blocked | — | Build errors G-6..G-9 block test execution |

---

## Cumulative known-good

- **60 tests passing** across errors + logger + schemas + web
- **GitHub:** repo public, 6 commits on origin/main, push working
- **CI:** workflow exists with 6 jobs; coverage gate now real (G-1 fixed). Has not been triggered yet — first push-to-main since gate-fix will validate.
- **Docker:** infra-only compose works. Services-in-compose deferred to CP-3 (G-3).

---

## Open decisions awaiting user

| ID | Question | Default if no answer |
|---|---|---|
| D-1 | Continue this session through G-6 / G-7 / G-8 / G-9 fixes, or stop and resume tomorrow? | Stop after CP-6 — user signal |
| D-2 | Force-push policy: now that public history is rewritten 2x, are we OK to force-push for future history clean-up or should we treat history as immutable from here? | Treat as immutable going forward |
| D-3 | Coverage lift target: 90% per package, or aggregate 90%? CI currently aggregates. | Aggregate 90%, with per-package floor of 75% |

---

## File map maintained

| Path | Purpose |
|---|---|
| `_session/SESSION_LOG.md` | Human-readable timeline |
| `_session/AUDIT_001_20260518_1514.md` | Initial enterprise-grade audit (4 gaps + 6 scaffolds) |
| `docs/COVERAGE_BASELINE.md` | Honest coverage state, replaces misleading 0% doc |
| `docs/TRACEABILITY.md` | THIS FILE — live record per CP |
| `_session/logs/bootstrap_*.log` | Bootstrap run output |
| `_session/logs/cp012_*.log` | Coverage baseline run output |
| `_backup/` | FILE BACKUP RULE compliance — every file edited backed up here first |
