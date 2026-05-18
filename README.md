# Roomard — AI Guest Memory Engine

[![CI](https://github.com/roomard/roomard/actions/workflows/ci.yml/badge.svg)](https://github.com/roomard/roomard/actions/workflows/ci.yml)

Roomard turns hotel guest preferences and history into one usable line at the
front desk: a "Say this" suggestion the moment a guest walks in. It captures
preferences via camera, OCR, and ambient voice notes; consolidates them across
properties; and produces a defensible audit trail behind every AI suggestion.

This repository is the full enterprise codebase produced for the AT-Hack0019
"Build with MeDo" hackathon — designed not as a hack-time prototype but as a
product strategy artefact, ready to extend into a paid pilot.

---

## Architecture at a glance

```
                              ┌─────────────────────────┐
                              │      apps/web (PWA)     │
                              └────────────┬────────────┘
                                           │  HTTPS
                              ┌────────────▼────────────┐
                              │  services/api-gateway   │
                              │  (auth, rate-limit,     │
                              │   RBAC, routing)        │
                              └────────────┬────────────┘
   ┌─────────┬─────────┬───────────────────┼──────────────────┬─────────┐
   │  auth   │ tenant  │      guest        │     capture      │  brief  │
   │         │         │                   │                  │         │
   └────┬────┴────┬────┴──────┬────────────┴────────┬─────────┴────┬────┘
        │         │           │                     │              │
        ▼         ▼           ▼                     ▼              ▼
              ┌──────────────────────────────────────────┐
              │    Postgres 16   |   Redis   |   S3/BOS  │
              └──────────────────────────────────────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │  services/ai-gateway   │
                     │ (Qianfan ERNIE, mock)  │
                     └────────────────────────┘
```

Full architecture, data model, API surface, traceability matrix, and test
strategy in [docs/](./docs/) and in the linked design documents.

---

## Getting started

### Prerequisites

- Node.js 20.10.0 (use `nvm use` — the `.nvmrc` is at the root)
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker 24+ and Docker Compose
- 4 GB free RAM, 10 GB free disk

### One-time setup

```bash
git clone https://github.com/roomard/roomard.git
cd roomard
cp .env.example .env
pnpm install
make up         # boots Postgres + Redis + MinIO + Mailpit
make db-migrate # applies schema migrations
make db-seed    # seeds demo tenant + users + properties
```

### Run the stack locally

```bash
make dev        # starts every service in parallel
# Then in another shell:
pnpm --filter @roomard/web dev   # web app at http://localhost:5173
```

The demo tenant slug is `demo`. Seeded users:

| Email                              | Password       | Role                  |
|------------------------------------|----------------|-----------------------|
| `gm@demo.local`                    | `Roomard123!`  | gm                    |
| `front_desk_manager@demo.local`    | `Roomard123!`  | front_desk_manager    |
| `front_desk_agent@demo.local`      | `Roomard123!`  | front_desk_agent      |

### Run tests

```bash
make test           # full test pyramid (unit + integration + e2e)
pnpm test           # unit tests only
make test-e2e       # Playwright E2E (requires stack up)
make test-load      # k6 load tests (requires ROOMARD_TOKEN env)
```

---

## Repository layout

```
roomard/
├── apps/
│   ├── web/               React + Vite + TanStack PWA
│   └── web-e2e/           Playwright end-to-end tests
├── services/
│   ├── api-gateway/       Edge: auth, RBAC, rate-limit, proxy
│   ├── auth/              Sessions, MFA, refresh-token rotation
│   ├── tenant/            Tenant/property/role CRUD
│   ├── guest/             Guest profiles, prefs, history, Say-This
│   ├── capture/           Card OCR → preference extraction
│   ├── brief/             Morning arrivals brief generation
│   ├── exception/         Review queue for low-confidence items
│   ├── audit/             Append-only audit log + hash chain verify
│   ├── ingest/            PMS webhook ingestion (Mews) + review polling
│   └── ai-gateway/        Single abstraction over Qianfan / mock AI providers
├── packages/
│   ├── db/                pg pool, RoomardPool, migrations, seed CLI, tenant context
│   ├── schemas/           Zod request/response schemas + types
│   ├── api-types/         Pure TypeScript types re-exported from schemas
│   ├── service-framework/ Fastify plugin: auth, RBAC, error handling, case translation
│   ├── errors/            Typed error hierarchy with stable codes
│   ├── logger/            Pino logger with secrets redaction
│   └── test-utils/        Shared test fixtures, JWT mint helpers, fake AI gateway
├── deploy/                Dockerfiles base + Helm chart skeleton
├── docs/                  ADRs, runbook, operational guides
├── load/                  k6 load tests (guest lookup, brief generation)
├── docker-compose.yml     Local dev infra (Postgres + Redis + MinIO + Mailpit)
└── Makefile               Common dev workflows
```

---

## Sponsor stack (AT-Hack0019)

The AI gateway is the only component aware of the model vendor. It chooses
between:

- **ERNIE 4.5** — `llm.brief`, `llm.review_link`
- **ERNIE X1** — `llm.reasoning` (deeper analysis, slower)
- **PaddleOCR-VL** — `ocr.card`
- **Qianfan MaaS** — host platform (auth + routing + caps)

For local dev and CI, `AI_GATEWAY_MOCK=true` enables a deterministic mock
provider so tests need zero credentials. Swap to live Qianfan by setting
`QIANFAN_API_KEY` and `QIANFAN_SECRET_KEY`.

---

## Production access requirements

Before deploying to a real tenant, the following external credentials need
provisioning. See [docs/runbook.md](./docs/runbook.md) for full procedures.

1. **Baidu Qianfan API key** — ERNIE 4.5, ERNIE X1, PaddleOCR-VL
2. **Postgres** — Baidu RDS EU or AWS RDS Frankfurt
3. **Object store** — Baidu BOS or AWS S3 (private bucket, AES-256 SSE)
4. **Mews Developer Portal** — sandbox + production API key per tenant
5. **SAML/OIDC IdP** — Microsoft Entra ID test tenant or saml.to
6. **Review API keys** — TripAdvisor, Booking.com, Google Business Profile
7. **SMTP** — Postmark or SES for brief delivery
8. **Secrets manager** — Vault or AWS Secrets Manager
9. **Sentry DSN** — error tracking
10. **Domain + TLS** — `api.roomard.com`, `app.roomard.com`

---

## Licence

Proprietary — © 2026 Roomard Ltd. Built with care for the AT-Hack0019
hackathon and intended for further commercial development.
