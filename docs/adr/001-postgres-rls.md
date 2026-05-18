# ADR 001: Postgres + Row-Level Security for multi-tenancy

**Status:** Accepted · **Date:** 2026-05-14

## Context

Roomard is a multi-tenant SaaS. Every row in every operational table belongs to
exactly one tenant. The blast radius of a bug that lets tenant A read tenant
B's data is catastrophic — both legally (UK GDPR Art. 32) and reputationally.

Common approaches:

1. Database-per-tenant — strong isolation, expensive to operate, painful for
   cross-tenant analytics.
2. Schema-per-tenant — somewhere in the middle, but DDL becomes O(tenants).
3. Shared schema with `tenant_id` column and discipline in application code —
   cheapest but the discipline is brittle. One missing `WHERE` clause is a
   breach.
4. Shared schema with `tenant_id` enforced by Postgres Row-Level Security —
   defence in depth.

## Decision

Option 4. Every tenant-scoped table has `tenant_id uuid NOT NULL`, an index on
it, and `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`. The policy is
`USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

Application code sets `app.tenant_id` via `SET LOCAL` inside a transaction,
wrapped by `withTenantContext()` in `@roomard/db`. Forgetting to set the GUC
means **zero rows visible**, not "leak everything" — fail closed.

The audit log and a small set of cross-tenant tables (`tenants`,
`prompt_templates`, `ai_call_logs`) are explicitly **not** RLS-protected;
they're accessed via the same connection pool but with no tenant context, by
admin and system actors only.

## Consequences

- **Pro:** every query at the application layer is automatically tenant-scoped.
  RLS errors fail closed.
- **Pro:** integration tests can assert "tenant B context returns zero rows
  inserted by tenant A".
- **Pro:** common Postgres tools (psql, GUI clients) connect under the same
  RLS regime — no special bypass for support staff.
- **Con:** every query in every service must run inside `withTenantContext()`.
  Forgetting it shows up as 0 rows returned — confusing in dev, easily caught
  in test.
- **Con:** EXPLAIN plans pick up an extra filter. Negligible in practice; we
  ensure every `tenant_id` column is indexed.
- **Con:** background jobs (briefs, polling, audit export) need explicit
  per-tenant fan-out. Acceptable cost.

## Alternatives considered

- **Database-per-tenant:** rejected. Onboarding a 51st tenant should not need a
  DBA. Cross-tenant analytics (e.g. brief usefulness benchmarks) would require
  separate ETL.
- **Pure application discipline:** rejected on first principles. Defence in
  depth costs almost nothing here; we'd be giving up a strong guarantee for no
  real reason.
