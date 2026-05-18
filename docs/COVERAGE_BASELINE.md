# Coverage baseline — honest measurement

**Date:** 2026-05-18 15:50 BST (after fixes CP-1..CP-5)
**Node:** v24.14.1
**pnpm:** 9.15.9
**Method:** `pnpm -r --filter "@roomard/*" run test:coverage` after fixing systemic test-import bugs

## Per-package outcome (current)

| Package | Status | Stmts % | Branch % | Funcs % | Notes |
|---|---|---|---|---|---|
| `@roomard/errors` | ✅ PASS | 96.29 | 81.63 | 94.73 | 16/16 tests. Uncovered lines 177, 179, 183, 196-198. |
| `@roomard/logger` | ✅ PASS | 100 | 100 | 100 | 4/4 tests. Fully covered. |
| `@roomard/schemas` | ✅ PASS | 98.31 | 75 | 50 | 32/32 tests (after CP-2 import fix + email-test off-by-one fix). Only `index.ts` barrel uncovered. |
| `@roomard/web` (apps/web) | ⚠️ PARTIAL | 10.83 | 56.81 | 45 | 8/8 tests pass. Coverage thin because tests only cover `auth.ts` (100%) + `api.ts` (97.59%). Routes, hooks, main untested. |
| `@roomard/db` | ❌ BUILD-DEPENDENT | n/a | n/a | n/a | Integration tests need `pnpm build` first to materialise `dist/` for inter-package imports. |
| 10 services (auth, tenant, guest, ingest, capture, brief, exception, audit, ai-gateway, api-gateway) | ❌ BLOCKED by latent type errors | n/a | n/a | n/a | Tests now find their imports (CP-3 fix), but full workspace `pnpm -r build` fails on real type errors in service-framework + ai-gateway. See "Remaining type errors" below. |
| `@roomard/service-framework` | ❌ BLOCKED | n/a | n/a | n/a | 3 type errors in src/auth.ts and src/plugin.ts (see below) |

## Headline numbers (verified working only)

| Metric | Value |
|---|---|
| Packages running cleanly | 4 of 17 with test scripts |
| Tests passing (cleanly-running packages) | 60 |
| Combined statement coverage where measured | logger 100% + schemas 98.31% + errors 96.29% + web 10.83% |
| Aggregate (weighted) | TBD — needs all packages running |
| CI gate (after CP-1) | 90% statements |

## Fixes landed today

| CP | Commit | What | Verified |
|---|---|---|---|
| CP-1 | `9ddc54f` | CI coverage gate `\|\| true` removed + pnpm 9.12.0 → 9.15.9 sync | ✅ pushed |
| CP-2 | `29a4181` | schemas test imports `../src/` → `../../src/` + email off-by-one | ✅ 32/32 tests pass |
| CP-3 | `d133654` | Sweep same import bug across 11 other test files | ✅ all test files load |
| CP-4 | `0aeb2df` | logger pino named-import fix for `stdSerializers`/`stdTimeFunctions` | ✅ `pnpm --filter @roomard/logger build` clean |
| CP-5 | `31c43db` | `RoomardPool` constructor accepts `pg.Pool \| DbConfig` | ✅ `pnpm --filter @roomard/db build` clean |

## Remaining real type errors (blocking full `pnpm -r build`)

These are **real bugs in the tarball-generated code**, not Claude-introduced. The tarball was never built clean.

### G-6: `service-framework/src/auth.ts:50` — `AuthenticationError` constructor signature mismatch

The class signature is `constructor(code = 'unauthenticated', message = 'Authentication required')` — two strings. The call sites across the codebase pass `(message, { reason })` — a string and an object. Result: the message becomes a code value, and the details object is silently dropped because the constructor doesn't accept a third parameter.

**Affected:** at least `auth/service.ts` (every throw), `service-framework/src/auth.ts`, likely more. Pattern is systemic.

**Fix shape:** widen `AuthenticationError` constructor to `(messageOrCode, optionalMessage, optionalDetails)` with type-narrowing logic similar to `ConflictError` and `IntegrationError` in the same file.

### G-7: `service-framework/src/plugin.ts:99` — Cannot find module 'pg' or its type declarations

service-framework imports `pg` but doesn't have it as a direct or dev dependency. The runtime works (hoisted from a sibling), but TypeScript can't resolve it.

**Fix shape:** add `pg` and `@types/pg` to `packages/service-framework/package.json` devDependencies.

### G-8: `service-framework/src/plugin.ts:112` — `'ip'` not in `TenantContext` type

A field passed to `withTenantContext` doesn't exist on the type. Either the `TenantContext` interface needs an `ip?: string` field added, or the call site shouldn't pass it.

### G-9: `ai-gateway/src/mock-provider.ts:23`, `qianfan-provider.ts:53,100` — Expected 0-1 args, got 2

Three call sites passing 2 args to functions that accept 0-1. Likely the same constructor-signature pattern as G-6.

## What this baseline doc replaces

The previous version (`a3b228b` on origin, now history-rewritten) claimed "0% overall" which was misleading. The truth was (a) my lcov regex couldn't parse the v8-coverage stub format, and (b) pnpm's default `--bail` cut the run after schemas failed before the rest of the queue could start. Both root-caused now.

## Concrete next CPs (proposed, not executed)

- CP-6: G-6 — widen `AuthenticationError` constructor signature  
- CP-7: G-7 — add pg + @types/pg to service-framework  
- CP-8: G-8 — fix TenantContext shape or remove `ip` from call site  
- CP-9: G-9 — fix ai-gateway provider argcount  
- CP-10: re-run full `pnpm -r build` → all packages green  
- CP-11: re-run full `pnpm -r test:coverage` → real aggregate baseline  
- CP-12 onwards: lift coverage where it's thin (apps/web routes/hooks)
