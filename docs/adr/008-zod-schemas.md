# ADR 008: Zod schemas as the single source of truth at the API boundary

**Status:** Accepted · **Date:** 2026-05-14

## Context

We have two trust boundaries that need validation:

1. The public HTTP boundary (request bodies, query strings, multipart fields)
2. Outputs from the AI Gateway and PMS webhooks

We also need TypeScript types for every payload, ideally without manual
duplication. The same types should flow into the web client.

## Decision

Every payload schema is a **Zod schema** in `@roomard/schemas`. The TypeScript
type is derived with `z.infer<typeof Schema>` and re-exported via
`@roomard/api-types`.

Service routes call `Schema.parse(req.body)` inside their handlers. The
service-framework error handler translates `ZodError` into a
`ValidationError` 400 response with the same field-level detail.

The web client imports the same types from `@roomard/api-types` and the same
schemas from `@roomard/schemas` — for forms, React Hook Form + Zod gives us
client-side validation that matches the server contract exactly.

Wire format uses snake_case; internal TypeScript uses camelCase. Translation
happens at the framework boundary — see ADR 010.

## Consequences

- **Pro:** one definition per payload, runtime-validated, statically typed,
  shared by both ends.
- **Pro:** when we change a schema, both ends fail to typecheck until they
  agree.
- **Pro:** OpenAPI generation is straightforward (we don't ship that today but
  the foundation is in place).
- **Con:** Zod adds ~50 KB gzipped to the web bundle. Acceptable.
- **Con:** Zod's runtime cost is higher than ajv. We measured Fastify+Zod at
  ~15% slower than Fastify+ajv on a hot path. Negligible at our throughput
  targets.

## Alternatives considered

- **ajv with JSON Schema + ts-json-schema-generator:** rejected. The DX is
  worse, refactoring is fiddly, and the schema/type drift risk is real.
- **TypeBox:** considered. Same JSON-Schema-shaped output, similar ergonomics
  to Zod, but the ecosystem (Hook Form integration, error formatting) is
  thinner.
