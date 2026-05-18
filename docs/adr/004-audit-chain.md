# ADR 004: Append-only audit log with hash chain

**Status:** Accepted · **Date:** 2026-05-14

## Context

The product promise includes "a defensible audit trail behind every AI
suggestion". This must survive:

- Compromised internal accounts (an admin should not be able to silently
  rewrite history)
- Forensic review for incidents (regulatory, DPO requests, contractual)
- Sub-second writes from triggers on hot tables (guests, preferences, briefs)
- Cross-tenant queries for the platform operator (Roomard ops staff)

## Decision

A single table, `audit_events`, with:

- `id uuid PRIMARY KEY` (v7)
- `occurred_at timestamptz NOT NULL`
- `tenant_id uuid` (nullable — system events have none)
- `actor_kind`, `actor_id`, `actor_label`
- `operation`, `resource_type`, `resource_id`, `data_class`
- `payload_hash text NOT NULL` (SHA-256 of canonical row payload)
- `previous_hash text` — the hash of the previous audit row for the same
  tenant
- `hash text NOT NULL GENERATED` — SHA-256 of the canonical pipe-joined fields
  including `previous_hash`

Two database triggers enforce the invariants:

- `audit_compute_hash` — `BEFORE INSERT` — computes `previous_hash` and `hash`
- `audit_block_modification` — `BEFORE UPDATE OR DELETE` — `RAISE EXCEPTION` so
  no path can rewrite the table

Application writes happen via a generic `AFTER INSERT/UPDATE/DELETE` trigger on
the hot tables (`emit_audit_event`) that reads `app.tenant_id`,
`app.actor_kind`, `app.user_id`, `app.request_id` from session GUCs and
inserts a row.

Verification is exposed at `GET /v1/audit/verify?from=&to=`. It re-hashes every
row in the range and asserts (a) the recomputed hash matches the stored hash
and (b) `previous_hash` chains to the prior row. Anything else returns a
broken chain marker which is treated as a P1 incident (see runbook §4.3).

## Consequences

- **Pro:** tampering is detectable. A bad actor who modifies an audit row
  cannot also recompute every subsequent hash without also updating the chain,
  and even then any honest verifier holding a single later hash detects the
  mismatch.
- **Pro:** verification is database-native and cheap — one pass over a date
  range, no external service required.
- **Pro:** the audit log is independent of application data — RLS off, no FK
  back into `tenants`, survives tenant deletion for the retention window.
- **Con:** every write to a hot table fires a trigger. Measured overhead in
  pgbench: ~70 µs per insert. Acceptable.
- **Con:** audit_events grows monotonically. We rely on PostgreSQL partitioning
  by month for the long-term retention; archival to cold storage after
  18 months.

## Alternatives considered

- **External SIEM (Splunk / Elastic) as the source of truth:** rejected for
  MVP. Adds a synchronous dependency. We will replicate to a SIEM in
  Sprint 11 for cross-tenant ops queries; the database remains canonical.
- **Merkle tree per tenant per day:** considered. Adds complexity for
  marginal benefit at our scale. Revisit if we exceed 1 M audit events per
  day per tenant.
