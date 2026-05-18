# ADR 002: AI Gateway abstraction over model vendors

**Status:** Accepted · **Date:** 2026-05-14

## Context

Roomard's product depends on several AI capabilities — OCR on captured cards,
LLM-generated guest briefs, review-to-guest linking, and deeper reasoning for
identity merges. The first delivery uses the Baidu Qianfan stack (ERNIE 4.5,
ERNIE X1, PaddleOCR-VL). Future deliveries will need:

- OpenAI / Anthropic / open-source models for non-China-resident customers
- Per-tenant model preference (cost vs. quality knobs)
- Vendor lock-in escape hatch — pricing or quality changes shouldn't ripple
  through the codebase
- Per-tenant rate and cost caps
- Auditable record of every AI call for the compliance posture

We could call the vendor SDK directly from every service. That makes each
service vendor-aware, leaks credentials, makes load testing harder, and
duplicates the rate-limit/cost-cap logic.

## Decision

A single dedicated service, `services/ai-gateway`, exposes a tiny HTTP surface
(`POST /v1/invoke`) with capabilities (`ocr.card`, `llm.brief`,
`llm.review_link`, `llm.reasoning`) and routes to an implementation behind the
`AiProvider` interface. Implementations:

- `MockAiProvider` — deterministic, used in CI and local dev
- `QianfanProvider` — production default, multiplexes ERNIE 4.5/X1 + PaddleOCR-VL

The gateway also:

- Logs every call into `ai_call_logs` (tenant_id, model, latency, token counts,
  cost in minor units, input/output hash)
- Enforces per-tenant daily token caps and per-minute rate caps before invocation
- Returns `ServiceUnavailableError` on transport failures so callers see a
  503, not a 500
- Computes deterministic input hashes so identical prompts can be cached
  (future optimisation; not in MVP)

## Consequences

- **Pro:** swapping providers is one PR touching one service.
- **Pro:** the rate/cost cap logic exists once.
- **Pro:** every AI call is auditable by construction.
- **Con:** an extra hop on every AI-touching request. Latency overhead measured
  at <8 ms p99 over loopback; acceptable.
- **Con:** the ai-gateway is on the critical path for capture, brief, and
  say-this. We mitigate with N≥2 replicas behind the API gateway, the same
  circuit-breaker discipline applied to other services, and the mock provider
  as a fast emergency fallback.

## Alternatives considered

- **Sidecar per service:** rejected. Configuration sprawl; no shared cap
  enforcement.
- **SDK shim library (no service):** rejected. Then every service needs the
  vendor credentials, which spreads the secrets surface.
