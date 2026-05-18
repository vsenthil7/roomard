# Security policy

## Reporting a vulnerability

If you believe you have found a security issue in Roomard, please email
**security@roomard.com** with as much detail as you can share. We aim to:

- Acknowledge within 24 hours (business hours UK)
- Triage and confirm within 72 hours
- Issue a fix or mitigation within 30 days for High/Critical, 90 days for
  Medium

Please do not open a public GitHub issue for security reports.

## Supported versions

The latest minor release of Roomard is supported. Older versions receive
security patches at our discretion for serious issues.

## Threat model summary

Briefly, the assets we protect (in priority order):

1. Guest personal data and preferences
2. The integrity of the audit log
3. Tenant data isolation (no cross-tenant reads or writes)
4. Operational continuity (front desk can always sign in and read today's
   brief)

The defences we lean on (see ADRs for the reasoning):

- PostgreSQL Row-Level Security with `FORCE RLS` on tenant tables
- Rotating refresh tokens with chain-revoke on reuse
- Append-only audit log with hash-chain verification endpoint
- Strict CSP at the web edge, no third-party scripts
- All secrets in a managed secrets store; no `*_SECRET` env values committed
- Container images run as non-root with read-only root filesystems
- Idempotent migrations, never reverted in production

## Out of scope

- Issues only reproducible against the `MockAiProvider` in `AI_GATEWAY_MOCK=true`
  mode (this is a development convenience, not a production code path).
- Dependency advisories that we have already triaged in the GitHub Security
  tab — they are typically waiting on upstream fixes; please use the existing
  thread if you have a workaround.
