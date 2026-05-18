# ADR 010: snake_case wire format with camelCase internals

**Status:** Accepted · **Date:** 2026-05-14

## Context

We need one canonical answer to "what does the JSON over the wire look like?"
and one canonical answer to "what do TypeScript types look like in source?".

Three reasonable conventions:

1. snake_case everywhere — feels alien in TypeScript
2. camelCase everywhere — diverges from the standard for REST APIs and from
   our Postgres column names
3. snake_case on the wire, camelCase in code — translate at the boundary

Database columns are snake_case by convention. The Roomard API Spec (a
hackathon deliverable) declares snake_case. TypeScript ecosystem strongly
prefers camelCase.

## Decision

Option 3. The wire format and the API Spec use snake_case. Internal
TypeScript — including Zod schemas after `transform`, repository methods, web
client state — uses camelCase.

The `@roomard/service-framework` package provides two recursive helpers,
`snakeToCamel` and `camelToSnake`, applied at the HTTP boundary:

- **On request:** Zod schemas accept the snake_case body directly; many fields
  in the schemas use `.transform()` (e.g. `email.toLowerCase()`) and the schema
  outputs the camelCase TypeScript shape we want.
- **On response:** `reply(replyHttp, status, body)` in the framework auto-
  translates camelCase keys back to snake_case before serialisation.

Web client request bodies are camelCase in the source code; the API client
wrapper does the same translation on the way out.

Database columns stay snake_case. Repository methods translate at the row
mapping step (`rowToGuest(r: GuestRow): Guest`). This is hand-rolled per
entity — there are not many entities and the mapping doubles as a place to
narrow types from `unknown`.

## Consequences

- **Pro:** TypeScript code reads naturally.
- **Pro:** the API stays idiomatic for REST consumers (curl, Postman, the
  Mews integration's webhook payload pattern).
- **Pro:** translation is centralised — one bug surface, easily tested.
- **Con:** developers must remember the convention. Mitigated by ESLint rules
  for camelCase identifiers in `.ts` files and by clear examples in service
  templates.
- **Con:** the translation has a runtime cost. Measured at <50 µs per
  response body of typical size. Negligible.

## Alternatives considered

- **camelCase everywhere on the wire:** would have been less work, but the
  hackathon's API Spec and our integration partners (Mews, Booking.com)
  publish snake_case patterns. Friction with their conventions outweighs the
  consistency win.
- **Manual translation per route:** rejected. Repetitive, error-prone,
  invisible in code review when forgotten.
