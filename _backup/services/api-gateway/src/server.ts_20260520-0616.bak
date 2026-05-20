/**
 * API Gateway. The single edge for client traffic.
 *
 * Responsibilities:
 *   - CORS for the SPA
 *   - Per-tenant rate limit (Redis-backed token bucket)
 *   - JWT verification & RBAC enforcement (terminate auth here)
 *   - x-request-id propagation
 *   - Proxy to internal services per route table
 *
 * Internal services trust the inbound JWT (verified again with shared secret —
 * defence in depth) and read tenant/user/role from claims.
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  isRoomardError,
  toSerializedError,
} from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import {
  authConfigFromEnv,
  verifyAccessToken,
  hasPermission,
} from '@roomard/service-framework';
import Fastify, { type FastifyRequest, type FastifyReply, type RouteHandlerMethod } from 'fastify';
import { request as undiciRequest } from 'undici';

import { matchRoute, upstreamsFromEnv, type Upstreams } from './routes.js';

const log = createLogger({ name: 'api-gateway' });

interface BuildDeps {
  upstreams: Upstreams;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  redisUrl?: string;
}

export function buildServer(deps: BuildDeps) {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 25 * 1024 * 1024,
    disableRequestLogging: true,
  });
  app.register(sensible);
  app.register(cors, {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  });
  app.register(rateLimit, {
    max: deps.rateLimitMax,
    timeWindow: deps.rateLimitWindowMs,
    keyGenerator: (req) => {
      const auth = req.headers.authorization ?? '';
      if (auth.startsWith('Bearer ')) {
        // Use sub claim as identity for rate-limit bucket without verifying;
        // a malformed token still hits the bucket — acceptable for abuse mitigation.
        try {
          const payload = JSON.parse(
            Buffer.from(auth.slice(7).split('.')[1] ?? '', 'base64url').toString('utf8'),
          ) as { sub?: string; tid?: string };
          if (payload.sub && payload.tid) return `auth:${payload.tid}:${payload.sub}`;
        } catch {
          /* fall through */
        }
      }
      return `ip:${req.ip}`;
    },
  });

  // G-28 fix — the gateway forwards raw body bytes to upstreams, so we register
  // an application/json content-type parser that buffers the body untouched.
  // Without this, Fastify 5's catch-all `app.route({ url: '/v1/*' })` registrations
  // have no parser for application/json content-types and Fastify throws
  // FST_ERR_CTP_INVALID_MEDIA_TYPE (statusCode 415) before reaching the handler.
  // The error handler below ALSO forwards err.statusCode for FastifyError instances
  // so the 415 (or any other Fastify-thrown status) propagates rather than being
  // masked as a generic 500.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Health endpoints (no auth)
  app.get('/health', async () => ({ status: 'ok', service: 'api-gateway' }));
  app.get('/ready', async () => ({ status: 'ready' }));

  // Generic handler for all other routes
  const authConfig = authConfigFromEnv();
  const handler: RouteHandlerMethod = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const method = req.method as 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
    const path = req.url.split('?')[0]!;
    const rule = matchRoute(method, path);
    if (!rule) {
      // Use the typed error so the error envelope (request_id, category, status)
      // is consistent with every other 404 in the system. Hand-crafted 404 bodies
      // here would diverge from the rest of the API and break frontend error parsing.
      throw new NotFoundError('route not found', { path, method });
    }

    if (rule.requiredPermission !== 'public') {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) {
        throw new AuthenticationError('missing bearer token');
      }
      const token = auth.slice(7);
      let principal;
      try {
        principal = await verifyAccessToken(token, authConfig);
      } catch {
        throw new AuthenticationError('invalid bearer token');
      }

      if (rule.requireMfa && !principal.mfaVerified) {
        throw new AuthenticationError('MFA required for this operation', {
          requireMfa: true,
        });
      }

      if (!hasPermission(principal, rule.requiredPermission)) {
        throw new AuthorizationError('insufficient permissions', {
          required: rule.requiredPermission,
          roles: principal.roles,
        });
      }

      // Inject standard headers for upstream
      req.headers['x-actor-id'] = principal.userId;
      req.headers['x-actor-tenant'] = principal.tenantId;
    }

    const upstreamBaseUrl = deps.upstreams[rule.upstream];
    const upstreamUrl = `${upstreamBaseUrl}${req.url}`;

    // Forward
    const upstreamHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'host' || k === 'content-length') continue;
      if (Array.isArray(v)) upstreamHeaders[k] = v.join(',');
      else if (typeof v === 'string') upstreamHeaders[k] = v;
    }
    upstreamHeaders['x-request-id'] = String(req.id);
    upstreamHeaders['x-roomard-edge'] = 'api-gateway';

    let body: Buffer | undefined;
    if (method !== 'GET' && method !== 'DELETE') {
      body = req.body instanceof Buffer ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}), 'utf8');
    }

    const startedAt = Date.now();
    const res = await undiciRequest(upstreamUrl, {
      method,
      headers: upstreamHeaders,
      body,
    });
    const elapsedMs = Date.now() - startedAt;
    log.info(
      { reqId: req.id, method, path, upstream: rule.upstream, status: res.statusCode, elapsedMs },
      'proxied',
    );

    // Pass status + headers + body through
    reply.code(res.statusCode);
    for (const [k, v] of Object.entries(res.headers)) {
      if (k === 'transfer-encoding' || k === 'content-length' || k === 'connection') continue;
      if (Array.isArray(v)) reply.header(k, v.join(','));
      else if (typeof v === 'string') reply.header(k, v);
    }
    const resBody = await res.body.arrayBuffer();
    return reply.send(Buffer.from(resBody));
  };

  // Register catch-all under each method
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'] as const) {
    app.route({
      method,
      url: '/v1/*',
      handler,
    });
    app.route({
      method,
      url: '/webhooks/*',
      handler,
    });
  }

  // Error handler
  app.setErrorHandler((err, req, reply) => {
    if (isRoomardError(err)) {
      reply
        .code(err.status)
        .send(toSerializedError(err, String(req.id)));
      return;
    }
    if ((err as { validation?: unknown }).validation) {
      const message = err instanceof Error ? err.message : 'validation error';
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message, requestId: String(req.id) } });
      return;
    }
    // G-28 fix — forward FastifyError statusCode rather than masking as 500.
    // Without this, a FST_ERR_CTP_INVALID_MEDIA_TYPE (415) thrown by the
    // content-type parser before the handler runs, an FST_ERR_VALIDATION (400),
    // or any other Fastify-thrown error with a meaningful statusCode would
    // surface to clients as a generic 500 INTERNAL with no actionable detail.
    const fastifyErr = err as { code?: string; statusCode?: number; message?: string };
    if (
      typeof fastifyErr.code === 'string' &&
      fastifyErr.code.startsWith('FST_') &&
      typeof fastifyErr.statusCode === 'number' &&
      fastifyErr.statusCode >= 400 &&
      fastifyErr.statusCode < 500
    ) {
      log.warn({ err, reqId: req.id }, 'fastify client error');
      reply.code(fastifyErr.statusCode).send({
        error: {
          code: fastifyErr.code,
          message: fastifyErr.message ?? 'request rejected',
          requestId: String(req.id),
        },
      });
      return;
    }
    log.error({ err, reqId: req.id }, 'unhandled error');
    reply.code(500).send({ error: { code: 'INTERNAL', message: 'internal server error', requestId: String(req.id) } });
  });

  return app;
}

export async function start(): Promise<void> {
  const app = buildServer({
    upstreams: upstreamsFromEnv(),
    rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '300', 10),
    rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    redisUrl: process.env.REDIS_URL,
  });
  const port = Number.parseInt(process.env.API_GATEWAY_PORT ?? '3000', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'api-gateway listening');

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  start().catch((err) => {
    log.error({ err }, 'failed to start');
    process.exit(1);
  });
}

// Re-exports so tests can use the route table
export { matchRoute, ROUTES } from './routes.js';
