# Contributing to Roomard

We welcome PRs that improve correctness, performance, security posture, or
documentation. This guide describes our conventions; following them gets your
patch merged faster.

## Development environment

```bash
nvm use                 # picks up .nvmrc → Node 20.10.0
corepack enable
pnpm install
make up
make db-migrate
make db-seed
make dev
```

## Coding style

- **TypeScript strict** — see `tsconfig.base.json`. No `any` except where
  truly justified; prefer `unknown` and narrow.
- **British English** in user-facing strings, docs, and code comments.
- **One concern per PR.** A schema change and a feature using it can be
  separate PRs.
- **Tests required.** Every new code path needs unit tests. The CI coverage
  gate is 90%.

## Commit messages

```
<scope>: short imperative sentence (≤72 chars)

Optional body explaining context and consequences. Wrap at 80 chars.
Reference issues by number where applicable.
```

Examples:

```
guest: include attentionFlags in search response
brief: skip generation when no arrivals on date
db: add index on stays(property_id, arrival_at)
```

## Pull requests

1. Branch from `develop`. Name the branch `<scope>/<short-slug>`.
2. Run `pnpm run lint && pnpm run typecheck && pnpm test` before pushing.
3. Open the PR against `develop`. CI must pass.
4. Reviewer will look for: tests, error handling, audit-trail completeness,
   DB migration safety, RBAC correctness.
5. Squash-merge on approval. The merge commit message is the PR title.

## Architectural decisions

For any change that touches multiple services, the AI gateway, the audit
chain, or the public API contract, write an ADR. See `docs/adr/` for the
template (any existing ADR will do as a model). Open the ADR PR first; the
implementation PR follows once the ADR is approved.
