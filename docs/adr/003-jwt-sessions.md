# ADR 003: JWT access tokens with rotating refresh tokens

**Status:** Accepted · **Date:** 2026-05-14

## Context

The web client and (future) mobile clients need authenticated sessions that:

- Survive page reloads
- Recover gracefully from network blips
- Are revocable in <60s when a user is removed or a device is compromised
- Don't require the API gateway to query the database on every request

## Decision

Two-token model:

- **Access token** — short-lived JWT (1 hour TTL), HS256, signed with
  `JWT_SECRET`. Carries `sub` (user id), `tid` (tenant id), `roles`, `mfa`
  claim. The API gateway and every internal service verify locally — no DB
  query.
- **Refresh token** — opaque random string, 24 hour TTL by default, stored
  hashed in `refresh_tokens`. Rotating: every refresh issues a new pair and
  marks the old one as `replaced_by`. Re-use of an already-replaced refresh
  token revokes the entire chain (compromise detection).

The web client persists both in `localStorage` (so a page reload doesn't sign
the user out). On a 401 from the API, the client makes a single in-flight
refresh request before retrying.

## Consequences

- **Pro:** every backend service verifies tokens with a single shared secret,
  no DB round-trip. The API gateway is the only place enforcing RBAC.
- **Pro:** revocation is achievable within the access-token TTL (max 1h) by
  refusing further refresh. For immediate revocation we additionally maintain
  a `revoked_users` set in Redis — cheap to check at the gateway.
- **Pro:** rotating refresh tokens catch stolen tokens used in parallel.
- **Con:** localStorage is XSS-readable. Mitigation: strict CSP (no
  `unsafe-inline`, no third-party scripts), HttpOnly cookies are an option for
  the refresh token but introduce CSRF complexity. We pick localStorage
  knowingly; the strict CSP is the compensating control.
- **Con:** HS256 vs RS256. HS256 is symmetric — every service has the secret.
  In our deployment topology (single tenant of the Roomard stack per VPC) this
  is acceptable. If we ever expose internal services across trust boundaries,
  upgrade to RS256.

## Alternatives considered

- **Session cookies only:** rejected. The mobile app needs token auth anyway,
  and cookies bring CSRF.
- **OAuth2 with an external IdP for first-party login:** unnecessary
  complexity; we have an IdP integration via SAML/OIDC for enterprise SSO, but
  password+MFA first-party login is the default.
