# ADR 006: Fastify for HTTP services

**Status:** Accepted · **Date:** 2026-05-14

## Context

Every backend service exposes an HTTP API. We want:

- Built-in JSON schema validation
- Pluggable middleware (auth, RBAC, error handling, observability)
- High throughput (the API gateway sits in front of mobile clients)
- Type-friendly with TypeScript
- Healthy ecosystem and active maintenance

Common contenders: Express, Koa, Fastify, NestJS, Hono.

## Decision

Fastify 5 across every service, plus the shared `@roomard/service-framework`
package that registers a standard plugin chain (sensible, multipart where
needed, our auth + RBAC + error handler).

The framework provides:

- `applyFramework(app, { serviceName, authConfig })` — single call sets up
  request-id propagation, Bearer-token auth, principal binding, error
  serialisation, snake↔camel translation, and health endpoints.
- `requirePrincipal(req)` and `requirePermission(principal, perm)` — used in
  every route.
- `withPrincipalContext(pool, req, fn)` — wraps DB queries in the tenant
  context required by RLS (see ADR 001).

## Consequences

- **Pro:** routes are tiny and obvious. The framework hides the boring stuff
  exactly once.
- **Pro:** Fastify's per-route schema validation is fast (JIT-compiled). We
  delegate to Zod at the boundary instead, which sacrifices a small amount of
  speed for much better DX and runtime type narrowing — the trade is worth it
  at our scale.
- **Pro:** `app.inject()` makes route tests trivial — no real HTTP server
  needed.
- **Con:** Fastify v5 is a relatively recent major. We pinned ^5.0.0 and will
  audit the lockfile changes per release.

## Alternatives considered

- **NestJS:** rejected for excessive ceremony. Decorators and modules add
  surface area; we don't need DI at our service size.
- **Hono:** considered. Smaller, edge-friendly, but the plugin ecosystem is
  thinner — no equivalent to `@fastify/multipart` battle-tested at our needed
  upload limits.
- **Express:** rejected. Maintenance signal is weak; we'd be writing all the
  niceties ourselves.
