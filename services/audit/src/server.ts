import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { AuditQuerySchema, AuditExportRequestSchema, UuidSchema } from '@roomard/schemas';
import {
  applyFramework,
  authConfigFromEnv,
  requirePrincipal,
  requirePermission,
  withPrincipalContext,
  reply,
} from '@roomard/service-framework';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { createLogger } from '@roomard/logger';
import { queryEvents, verifyChain } from './service.js';

const log = createLogger({ name: 'audit-svc' });

export function buildServer(deps: { pool: RoomardPool }): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });
  app.register(sensible);
  applyFramework(app, { serviceName: 'audit', authConfig: authConfigFromEnv() });

  app.get('/v1/audit/events', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'audit.read');
    const q = AuditQuerySchema.parse(req.query ?? {});
    const result = await withPrincipalContext(deps.pool, req, (client) =>
      queryEvents(client, {
        from: q.from,
        to: q.to,
        resourceType: q.resourceType,
        resourceId: q.resourceId,
        actorId: q.actorId,
        operation: q.operation,
        limit: q.limit,
        cursor: q.cursor,
      }),
    );
    reply(replyHttp, 200, {
      items: result.items,
      page: { size: result.items.length, nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  });

  app.get('/v1/audit/verify', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'audit.read');
    const q = req.query as { from?: string; to?: string };
    if (!q.from || !q.to) {
      replyHttp.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'from and to query params required' },
      });
      return;
    }
    const result = await withPrincipalContext(deps.pool, req, (client) =>
      verifyChain(client, principal.tenantId, q.from!, q.to!),
    );
    reply(replyHttp, 200, result);
  });

  app.post('/v1/audit/export', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'audit.read');
    const body = AuditExportRequestSchema.parse(req.body);
    await withPrincipalContext(deps.pool, req, async (client) => {
      // Stream-style would page rows; for MVP, return inline if small.
      const result = await queryEvents(client, {
        from: body.from,
        to: body.to,
        resourceType: body.resourceType,
        limit: 5000,
      });
      const verify = await verifyChain(client, principal.tenantId, body.from, body.to);
      reply(replyHttp, 200, {
        export: result.items,
        verification: verify,
        reason: body.reason,
        generatedAt: new Date().toISOString(),
      });
    });
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const app = buildServer({ pool });
  const port = Number.parseInt(process.env.AUDIT_PORT ?? '3007', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'audit-svc listening');
  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await app.close();
    await pool.close();
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

// re-export for tests
export { verifyChain, queryEvents } from './service.js';
