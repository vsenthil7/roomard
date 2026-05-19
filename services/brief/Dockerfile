# Multi-stage Dockerfile for the brief service.
# Inherits the shared service build pattern.

FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc* ./
COPY packages ./packages
COPY services ./services
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS builder
RUN pnpm --filter "@roomard/brief-svc..." build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable && addgroup -S roomard && adduser -S -G roomard roomard
WORKDIR /app
COPY --from=builder --chown=roomard:roomard /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=roomard:roomard /app/packages ./packages
COPY --from=builder --chown=roomard:roomard /app/services/brief ./services/brief
RUN pnpm install --frozen-lockfile --prod --filter "./services/brief..."
USER roomard
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O- "http://localhost:${PORT:-3000}/health" || exit 1
CMD ["node", "services/brief/dist/server.js"]
