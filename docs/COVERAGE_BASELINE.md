# Coverage baseline — LOCKED (CP-76)

**Date:** 2026-05-20 14:08 BST
**Locked at commit:** the CP-76 commit on `origin/main` (https://github.com/vsenthil7/roomard)
**Node:** v24.14.1 · **pnpm:** 9.15.9 · **Vitest:** 2.1.x (v8 coverage provider)
**Method:** `pnpm -r --no-bail run test:coverage` — fresh full-workspace run, every figure below copied verbatim from the v8 `All files` summary line of that run (no estimates, no carried-over numbers).
**Status:** **356 unit tests passing, 0 failing.** Plus **8 DB integration tests** that pass against a live Postgres when `DATABASE_URL` is set, and skip cleanly otherwise.

This supersedes the CP-19 baseline (2026-05-19), which predated the entire CP-52→CP-74 coverage lift and is no longer representative.

---

## Per-module measured coverage (exact, % statements)

Sorted high → low. Branch and function percentages included for completeness; the CI gate is on statements.

| # | Module | Stmts % | Branch % | Funcs % | Tests | Notes |
|---|---|---|---|---|---|---|
| 1 | `@roomard/logger` | **100** | 89.47 | 100 | 20 | Fully covered (incl. G-33 Sentry-forwarder fix, CP-57) |
| 2 | `@roomard/schemas` | **98.31** | 75 | 50 | 32 | Only the `index.ts` barrel uncovered |
| 3 | `@roomard/capture-svc` | **97.84** | 72.22 | 100 | 12 | object-store S3 paths covered via mocked client (CP-59) |
| 4 | `@roomard/brief-svc` | **95.86** | 79.22 | 100 | 26 | Strong; prep-card + pipeline paths covered |
| 5 | `@roomard/errors` | **93.8** | 83.33 | 100 | 22 | Some flexible-signature branches not exercised |
| 6 | `@roomard/ai-gateway` | **91.31** | 76.74 | 97.14 | 45 | AiGateway facade index.ts 0→95 (CP-72); only the QianfanProvider env branch left |
| 7 | `apps/web` | **89.28** | 79.35 | 81.57 | 39 | All 7 routes 84–100; only `main.tsx` bootstrap left (browser-only floor) |
| 8 | `@roomard/ingest-svc` | **82.43** | 76.92 | 87.5 | 29 | Mews sync + review poller + webhook HMAC path covered |
| 9 | `@roomard/guest-svc` | **81.6** | 62.5 | 78.57 | 20 | search/history/trajectory covered |
| 10 | `@roomard/auth-svc` | **81.46** | 83 | 86.36 | 32 | Refresh rotation added (CP-73); mfa-verify success body needs live TOTP |
| 11 | `@roomard/tenant-svc` | **81.13** | 86.36 | 66.66 | 14 | CRUD handlers covered; only `start()` left |
| 12 | `@roomard/api-gateway` | **79.31** | 84.74 | 57.14 | 18 | authed-proxy + RBAC covered; validation branch + `start()` left |
| 13 | `@roomard/exception-svc` | **77.65** | 76.74 | 87.5 | 15 | PATCH success + cursor round-trip covered |
| 14 | `@roomard/audit-svc` | **75.11** | 62.85 | 62.5 | 19 | G-37 fixed (CP-74); verifyChain re-derives hash in SQL |
| — | `@roomard/db` | 3.24 (unit) | 0 | 0 | **8 integration** | Integration-gated — see below |
| — | `@roomard/service-framework` | (not measured) | — | — | 13 | No `test:coverage` script in this package |

**Unweighted mean across the 14 measured modules: 87.51%** (min 75.11, max 100). **11 of 14 modules ≥ 80%; 6 of 14 ≥ 90%.**

> **Aggregate caveat (honest):** The figure above is the simple mean of per-module percentages. The CI coverage gate aggregates by **statements weighted per module**, which this baseline does not recompute because the workspace is configured for vitest's text reporter only (no `coverage-summary.json` is emitted to sum raw statement counts across packages). The per-module percentages are exact; the single weighted aggregate is not asserted here rather than be fabricated. To produce a precise weighted figure, add the `json-summary` reporter to each `vitest.config` and sum `total.statements` across packages.

---

## The DB package — integration-gated, not "uncovered"

`@roomard/db`'s unit run reports 3.24% because its real exercise is the **integration suite**, which is gated on `DATABASE_URL`:

- Run with `set DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard&&` (use `127.0.0.1`, **not** `localhost` — Node on Windows resolves `localhost` to IPv6 `::1` first and stalls the container TCP path).
- **8 tests pass:** 4 RLS isolation + 4 audit hash-chain, against the live container Postgres.
- Without `DATABASE_URL` they skip cleanly (so a no-DB CI run is still green).

These tests are where G-34 (schema drift), G-35 (SET-bind-param production bug), G-36 (superuser-bypasses-RLS security gap), and the lead for G-37 (audit schema drift) were all found. The line-coverage number understates the value: the tenant-context, RLS, and audit-chain code paths are genuinely exercised end to end.

---

## Legitimate coverage floors (flagged honestly, NOT padded)

These cannot reach 100% without external infrastructure, and are deliberately left rather than faked:

- **Every service's `start()`** — binds a port and calls `app.listen`; needs a live listener, not a unit test.
- **`apps/web/main.tsx`** — ReactDOM mount + PWA service-worker registration; runs only in a real browser.
- **auth-svc mfa-verify success body** — needs a live TOTP code to pass `authenticator.verify`.
- **ai-gateway QianfanProvider constructor branch** — needs real `QIANFAN_*` env to instantiate the live provider.
- **audit-svc verifyChain full chain** — partially de-risked by the db audit-chain integration test; full coverage wants a long real linked chain.

---

## Bug findings during the lift (cross-reference)

The canonical ledger is `docs/TRACEABILITY.md`. The lift toward this baseline surfaced **three production-grade bugs invisible to the mocked unit suite**, plus one security finding — the direct payoff of chasing real coverage and live-DB integration rather than padding:

| ID | Severity | What | Found via | Fixed |
|---|---|---|---|---|
| G-33 | Functional | Sentry error-forwarder was dead code (pino `logMethod` gate never matched) | writing logger tests | CP-57 |
| G-35 | Production | `SET LOCAL app.x = $1` rejected by Postgres → every `withTenantContext` call fails on real PG | db integration | CP-69 |
| G-37 | Production | audit service queried non-existent columns (`hash`/`resource_type`) → query + verify endpoints 500 | live-schema check | CP-74 |
| G-36 | Security | app DB role is superuser + BYPASSRLS → RLS silently not enforced | db integration | OPEN (infra) |

**Score: 38 fixed, 1 invalid (G-5), 1 open (G-36 — infra/provisioning).**

---

## How to reproduce this baseline

```
# Full workspace coverage (unit)
pnpm -r --no-bail run test:coverage

# DB integration suite (needs the postgres container up on host port 5532)
set DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard&& pnpm --filter @roomard/db run test
```

Each module's percentage is the `All files` line of its own coverage run. service-framework is excluded (no coverage script). db's headline is the integration-test pass count, not the unit line-coverage.

---

## Remaining roadmap (from TRACEABILITY.md)

- **CP-77** — (infra) G-36 remediation: provision the production app DB role as `NOSUPERUSER NOBYPASSRLS` so RLS actually enforces.
- **CP-78** — (optional) lift the remaining mid-70s unit-testable branches in exception / guest / ingest / audit.
- Deferred (need external resources): deployable URL (Qianfan keys, Mews tenant, DNS/TLS/secrets), real SSO IdP, GDPR subject-access/erasure, second PMS connector, real commercial review-API adapters, web bundle code-splitting.
