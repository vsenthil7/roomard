# ADR 007: React + TanStack for the web client

**Status:** Accepted · **Date:** 2026-05-14

## Context

The web client targets:

- Front-desk staff on iPads and budget Android tablets (often older Chrome
  versions)
- Mobile-first capture flow (camera, offline support)
- Long-lived sessions (8+ hours)
- A few dozen distinct routes (briefs, guests, captures, exceptions,
  admin, compliance)

Need: hot reload in dev, strong typing, predictable state, server state caching
with offline support, fast bundle (sub-200 KB gzipped to the critical path).

## Decision

- **React 18** — boring, vast hiring pool, owned by Meta with long-term
  support commitments.
- **Vite 5** — dev-server + production bundler. Fast HMR; ESM by default.
- **TanStack Router** — file-based or programmatic routing with first-class
  type-safe params. We use programmatic to avoid a codegen step.
- **TanStack Query** — server state, caching, retry/refetch logic, optimistic
  updates. Critical for the offline-first capture flow.
- **Zustand** — lightweight client state (auth tokens, UI mode). Persisted to
  localStorage via the `persist` middleware.
- **React Hook Form + Zod** — forms with validation co-located with shared
  schemas.
- **Tailwind 3** — utility CSS. No CSS-in-JS runtime cost. Components are
  built inline; pattern library lives in `src/components`.
- **vite-plugin-pwa (Workbox)** — service worker registration, asset
  precaching, runtime caching for today's brief and recently viewed guests.

## Consequences

- **Pro:** every choice has independent ownership and a strong community —
  none of them are bus-factor-1.
- **Pro:** route splitting + Vite's manual chunks means the critical-path
  bundle (login + brief) is small.
- **Pro:** TanStack Query gives us SWR semantics with zero glue code — the
  offline experience is "use cached today's brief, refresh in background when
  back online".
- **Con:** Tailwind in source has a learning curve and looks busy. We
  compensate with `@layer components` for repeated patterns (`btn-primary`,
  `card`, etc).
- **Con:** Zustand persistence in localStorage is XSS-readable. See ADR 003
  for the compensating control (strict CSP).

## Alternatives considered

- **Next.js:** rejected for the SPA use case. The server-rendering features
  aren't useful for an authenticated, dynamic, internal-facing app, and they
  drag in a server runtime we don't want to operate.
- **Remix:** same reasoning.
- **Solid / Svelte:** smaller communities; hiring would be harder; benefits
  are marginal at our complexity level.
