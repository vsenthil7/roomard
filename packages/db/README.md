# @roomard/db

Database access layer for Roomard. Owns:

- Postgres connection pool (per service)
- Migration runner (forward + rollback)
- Tenant context (sets `app.tenant_id` on every transaction for RLS)
- Audit context (records `app.user_id`, `app.request_id` for audit triggers)
- Seed data for dev and tests

Migrations live in `migrations/` and execute in lexical order. Each migration is a single SQL
file. Down migrations are paired (`NNNN_name.down.sql`); applied only via the CLI rollback
command, never automatically.
