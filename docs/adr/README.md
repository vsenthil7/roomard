# Architecture Decision Records

ADRs capture significant architectural decisions, their context, and their
consequences. Each ADR is immutable once accepted; revisions create a new ADR
that supersedes the prior one.

| #   | Title                                                          | Status   |
|-----|----------------------------------------------------------------|----------|
| 001 | [Postgres + RLS for multi-tenancy](./001-postgres-rls.md)       | Accepted |
| 002 | [AI Gateway abstraction over model vendors](./002-ai-gateway.md) | Accepted |
| 003 | [JWT sessions with rotating refresh tokens](./003-jwt-sessions.md) | Accepted |
| 004 | [Append-only audit log with hash chain](./004-audit-chain.md)   | Accepted |
| 005 | [Monorepo with pnpm workspaces](./005-monorepo.md)              | Accepted |
| 006 | [Fastify for HTTP services](./006-fastify.md)                   | Accepted |
| 007 | [React + TanStack for the web client](./007-react-tanstack.md)  | Accepted |
| 008 | [Zod schemas at the API boundary](./008-zod-schemas.md)         | Accepted |
| 009 | [Offline-first capture via IndexedDB](./009-offline-captures.md) | Accepted |
| 010 | [snake_case wire format with camelCase internals](./010-case-translation.md) | Accepted |
