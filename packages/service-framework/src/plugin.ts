import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { createLogger } from '@roomard/logger';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  isRoomardError,
  toSerializedError,
} from '@roomard/errors';
import { withTenantContext } from '@roomard/db';
import { type AuthPrincipal, type AuthConfig, verifyAccessToken } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthPrincipal;
  }
}

export interface FrameworkOptions {
  serviceName: string;
  authConfig: AuthConfig;
  /** Routes (path prefixes) that do NOT require authentication. */
  publicPaths?: string[];
}

export function applyFramework(app: FastifyInstance, opts: FrameworkOptions): void {
  const log = createLogger({ name: opts.serviceName });
  const publicPaths = new Set<string>([
    '/health',
    '/ready',
    '/metrics',
    ...(opts.publicPaths ?? []),
  ]);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', String(req.id));
  });

  app.addHook('preHandler', async (req) => {
    if (publicPaths.has(req.url.split('?')[0] ?? req.url)) return;
    if ((req.url.split('?')[0] ?? '').startsWith('/auth/')) return;

    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/.exec(header);
    if (!match) {
      throw new AuthenticationError('missing Bearer token');
    }
    const principal = await verifyAccessToken(match[1]!, opts.authConfig);
    req.principal = principal;
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `route ${req.method} ${req.url} not found`,
        requestId: String(req.id),
      },
    });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const ve = new ValidationError('invalid request body', {
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      reply.code(ve.status).send(toSerializedError(ve, String(req.id)));
      return;
    }
    if (isRoomardError(err)) {
      reply.code(err.status).send(toSerializedError(err, String(req.id)));
      return;
    }
    log.error({ err, requestId: req.id }, 'unhandled error');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: String(req.id),
      },
    });
  });

  app.get('/health', async () => ({ status: 'ok', service: opts.serviceName }));
  app.get('/ready', async () => ({ status: 'ready', service: opts.serviceName }));
}

/**
 * Wraps a handler so all DB queries inside run with the tenant context set
 * (RLS + audit triggers will see app.tenant_id, app.user_id, app.request_id).
 */
export function withPrincipalContext<T>(
  pool: import('@roomard/db').RoomardPool,
  req: FastifyRequest,
  fn: (client: import('pg').PoolClient) => Promise<T>,
): Promise<T> {
  const principal = req.principal;
  if (!principal) {
    throw new AuthorizationError('no authenticated principal');
  }
  return withTenantContext(
    pool,
    {
      tenantId: principal.tenantId,
      userId: principal.userId,
      actorKind: 'user',
      requestId: String(req.id),
      ip: typeof req.ip === 'string' ? req.ip : undefined,
      userAgent: req.headers['user-agent'],
    },
    fn,
  );
}

export function requirePrincipal(req: FastifyRequest): AuthPrincipal {
  if (!req.principal) throw new AuthenticationError('no authenticated principal');
  return req.principal;
}

// snake_case ↔ camelCase translators for the HTTP boundary
const SNAKE_RE = /_([a-z0-9])/g;
const CAMEL_RE = /([A-Z])/g;

export function snakeToCamel<T>(input: unknown): T {
  if (Array.isArray(input)) return input.map((i) => snakeToCamel(i)) as unknown as T;
  if (input !== null && typeof input === 'object' && input.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k.replace(SNAKE_RE, (_, c: string) => c.toUpperCase())] = snakeToCamel(v);
    }
    return out as T;
  }
  return input as T;
}

export function camelToSnake<T>(input: unknown): T {
  if (Array.isArray(input)) return input.map((i) => camelToSnake(i)) as unknown as T;
  if (input !== null && typeof input === 'object' && input.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k.replace(CAMEL_RE, (_, c: string) => '_' + c.toLowerCase())] = camelToSnake(v);
    }
    return out as T;
  }
  return input as T;
}

export function reply<T>(reply: FastifyReply, status: number, body: T): void {
  reply.code(status).send(camelToSnake(body));
}
