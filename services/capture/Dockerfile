# Multi-stage Dockerfile for the capture service.
# Uses pnpm deploy to produce a self-contained runtime bundle that includes
# all prod deps (direct + transitive workspace-package deps). The older
# `pnpm install --prod --filter` pattern silently dropped transitive deps
# coming through workspace packages, leaving services unable to resolve
# `pg`/`jose` at runtime even though they were declared in @roomard/db /
# @roomard/service-framework. See G-21/G-22.

FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc* ./
COPY packages ./packages
COPY services ./services
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS builder
RUN pnpm --filter "@roomard/capture-svc..." build
# Produce a self-contained deploy bundle at /deploy with the service's compiled
# code + its complete prod dependency closure. node_modules inside the bundle
# resolves cleanly under Node's ESM loader without phantom-dep surprises.
RUN pnpm --filter @roomard/capture-svc deploy --prod /deploy

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S roomard && adduser -S -G roomard roomard
WORKDIR /app
COPY --from=builder --chown=roomard:roomard /deploy ./
USER roomard
EXPOSE 3004
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O- "http://127.0.0.1:${CAPTURE_PORT:-3004}/health" || exit 1
CMD ["node", "dist/server.js"]
