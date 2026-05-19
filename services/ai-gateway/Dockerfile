# Multi-stage Dockerfile for the ai-gateway service.
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
RUN pnpm --filter "@roomard/ai-gateway..." build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable && addgroup -S roomard && adduser -S -G roomard roomard
WORKDIR /app
COPY --from=builder --chown=roomard:roomard /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=roomard:roomard /app/packages ./packages
COPY --from=builder --chown=roomard:roomard /app/services/ai-gateway ./services/ai-gateway
RUN pnpm install --frozen-lockfile --prod --filter "./services/ai-gateway..."
USER roomard
EXPOSE 3008
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O- "http://127.0.0.1:${AI_GATEWAY_PORT:-3008}/health" || exit 1
CMD ["node", "services/ai-gateway/dist/server.js"]
