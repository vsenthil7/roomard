# Coverage baseline — honest measurement after full enterprise lift

**Date:** 2026-05-19 16:43 BST (after CP-1 through CP-19)
**Node:** v24.14.1
**pnpm:** 9.15.9
**Method:** `pnpm -r --no-bail --filter "@roomard/*" run test:coverage`
**Status:** **All 14 packages with tests now run cleanly. 121 tests passing. 0 failing.**

## Per-package state — actual numbers

| # | Package | Tests | Stmts % | Branch % | Funcs % | Notes |
|---|---|---|---|---|---|---|
| 1 | `@roomard/logger` | 4/4 ✅ | **100** | 100 | 100 | Fully covered |
| 2 | `@roomard/schemas` | 32/32 ✅ | **98.31** | 75 | 50 | Only `index.ts` barrel uncovered |
| 3 | `@roomard/errors` | 16/16 ✅ | **92.38** | 78.43 | 94.73 | Some flexible-signature branches not exercised |
| 4 | `@roomard/brief-svc` | 5/5 ✅ | **90.81** | 72.22 | 75 | pipeline.ts well-covered; lines 293-298, 337-351 uncovered |
| 5 | `@roomard/guest-svc` | 7/7 ✅ | **76.11** | 48.07 | 72.72 | service.ts: search() and history() partly covered |
| 6 | `@roomard/capture-svc` | 4/4 ✅ | **75** | 65.57 | 57.14 | object-store.ts mostly stubbed (S3 client not exercised) |
| 7 | `@roomard/ingest-svc` | 8/8 ✅ | **50.31** | 68.75 | 40 | server.ts route handlers untested (verifyMewsSignature + ingestMewsReservation are covered) |
| 8 | `@roomard/exception-svc` | 4/4 ✅ | **46.8** | 27.27 | 42.85 | Most server.ts route handlers untested |
| 9 | `@roomard/auth-svc` | 5/5 ✅ | **33.09** | 77.27 | 41.17 | passwordLogin and lockout covered; MFA, refresh-rotation, password-change paths untested |
| 10 | `@roomard/ai-gateway` | 10/10 ✅ | **29.97** | 60.6 | 83.33 | mock-provider 88%; qianfan-provider 0% (no test stub yet); index.ts (Fastify server) 0% |
| 11 | `@roomard/tenant-svc` | 3/3 ✅ | **25.47** | 60 | 66.66 | Auth/permission rejection paths covered; CRUD route handlers untested |
| 12 | `@roomard/audit-svc` | 7/7 ✅ | **25.22** | 64.28 | 33.33 | server.ts 0%; service.ts partially covered |
| 13 | `@roomard/api-gateway` | 8/8 ✅ | **23.28** | 92.85 | 33.33 | routes.ts 82% (route table); server.ts 0% (proxy logic untested) |
| 14 | `@roomard/web` | 8/8 ✅ | **10.68** | 56.81 | 45 | Only auth store + api.ts tested; 7 route components 0% |
| 15 | `@roomard/db` | 0/7 ⊘ | 3.24 | 0 | 0 | Integration tests skipped (need live Postgres) |

**Totals**: 121 tests passing, 0 failing, 7 skipped (db integration — DB-dependent).

## Aggregate coverage analysis (honest)

The CI gate aggregates across all packages weighted by total statements per package. Rough estimate (weighted by visible source line counts):

- Heavy hitters with low coverage (server.ts files ≈ 100-225 lines each, mostly 0%): api-gateway server.ts (225), exception server.ts (230), audit server.ts (111), ingest server.ts (224), tenant server.ts (149), web routes (~1100 total lines)
- Light-but-high coverage: schemas, logger, errors (small files at 90%+)

**Realistic aggregate**: ~35-45%. The 90% CI gate will fail on every push until either (a) the server.ts/routes test layers are added, or (b) the gate is tuned down to a per-package floor + aggregate target.

## What changed between v1 baseline and now

The previous (now-superseded) baseline at commit `a3b228b` claimed "0% overall" — that was wrong because the pnpm `--bail` killed the queue after schemas crashed and my lcov regex didn't parse v8's stub format. This v2 baseline (this doc) reflects reality after all CP-1..CP-19 fixes.

## Outstanding G-issues (live)

See `docs/TRACEABILITY.md` for the canonical list. As of 2026-05-19 16:43 BST:

| Status | Count | IDs |
|---|---|---|
| ✅ FIXED | 14 | G-1, G-2, G-4, G-6, G-7, G-8, G-9, G-10, G-11, G-12, G-13, G-14, G-15, G-16 |
| ❌ INVALID | 1 | G-5 (false alarm) |
| ❌ OPEN | 1 | G-3 (docker-compose lacks service blocks — pending CP) |

## Next CPs to lift coverage to honest ≥90% aggregate

Smallest-effort-first per CLAUDE_RULES:

- **CP-20**: web — write at least 1 test per route component (Login, Brief, Captures, Guests, Exceptions). Should lift web from 10.68% to ~50%.
- **CP-21**: api-gateway server.ts — supertest-based end-to-end through the gateway with mocked upstreams. Lifts from 23% to ~70%.
- **CP-22**: exception, audit, tenant, ingest server.ts — same supertest pattern. Lifts each from ~25-50% to ~80%.
- **CP-23**: auth — cover MFA, refresh, password change paths. Lifts from 33% to ~80%.
- **CP-24**: ai-gateway — qianfan-provider tests with mocked Qianfan API. Lifts from 30% to ~75%.
- **CP-25**: capture object-store — mock S3 client tests. Lifts capture from 75% to ~90%.
- **CP-26**: db — start `docker compose up postgres` in test setup, unblock 7 skipped integration tests.
- **CP-27**: re-run, verify aggregate ≥90%, declare baseline locked.
- **CP-28**: G-3 — services and web in docker-compose, per user's "everything in docker" requirement.

## Raw test count summary

Across all 14 testing packages: **121 unit tests + 7 skipped integration tests = 128 total**. Zero failures.
