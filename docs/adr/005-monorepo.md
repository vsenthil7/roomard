# ADR 005: pnpm workspaces monorepo

**Status:** Accepted · **Date:** 2026-05-14

## Context

Roomard has ~10 services, a web app, an e2e suite, and 7 shared libraries.
They share type definitions, error classes, Zod schemas, and a Fastify plugin
chain. Options:

1. Monorepo with workspaces
2. Per-repo with versioned npm packages
3. Hybrid (monorepo for services, separate for web)

## Decision

A single monorepo with pnpm workspaces. Layout:

```
packages/   — shared libraries (db, schemas, errors, logger, …)
services/   — backend services (api-gateway, auth, guest, …)
apps/       — frontend apps (web, web-e2e)
```

`pnpm-workspace.yaml` declares the three roots. `tsconfig.json` uses project
references so `tsc -b` does the right thing across the workspace.

Internal dependencies use `workspace:*` — pnpm rewrites them to actual versions
at publish time (we don't publish today, but the option stays open).

## Consequences

- **Pro:** schema changes ripple through with one PR. No "release a new
  version of @roomard/schemas, wait, bump every service".
- **Pro:** CI runs `pnpm install --frozen-lockfile` once, builds everything in
  parallel.
- **Pro:** shared dev tooling (eslint config, tsconfig.base.json, prettier)
  lives once.
- **Con:** repository grows. We mitigate by keeping each service to ~2k lines,
  using strict TypeScript settings to catch dead code, and pruning examples.
- **Con:** team coordination overhead. Mitigated by codeowners files (not
  added yet — would be Sprint 2).

## Alternatives considered

- **npm workspaces:** works, but pnpm's content-addressable store is materially
  faster for our install profile and the symlink-based node_modules layout
  catches `phantom dependencies` at typecheck time, which is a strong property.
- **Nx / Turborepo on top:** unnecessary at our current size. `pnpm -r` and
  good vitest configuration cover the build-orchestration use case.
