/**
 * Exception queue — review, assign, resolve items routed here from upstream
 * pipelines (capture low-confidence, identity merge candidates, PMS sync failures, etc.).
 */
import sensible from '@fastify/sensible';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { NotFoundError, ValidationError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import {
  ExceptionPatchRequestSchema,
  ExceptionKindSchema,
  ExceptionStatusSchema,
  UuidSchema,
} from '@roomard/schemas';
import {
  applyFramework,
  authConfigFromEnv,
  requirePrincipal,
  requirePermission,
  withPrincipalContext,
  reply,
} from '@roomard/service-framework';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';

const log = createLogger({ name: 'exception-svc' });

const ListQuerySchema = z.object({
  status: ExceptionStatusSchema.optional(),
  kind: ExceptionKindSchema.optional(),
  propertyId: UuidSchema.optional(),
  assignedTo: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export class ExceptionRepo {
  async list(
    client: PoolClient,
    q: z.infer<typeof ListQuerySchema>,
  ): Promise<{ items: unknown[]; nextCursor: string | null; hasMore: boolean }> {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (q.status) {
      where.push(`status = $${i}::exception_status`);
      params.push(q.status);
      i += 1;
    }
    if (q.kind) {
      where.push(`kind = $${i}::exception_kind`);
      params.push(q.kind);
      i += 1;
    }
    if (q.propertyId) {
      where.push(`property_id = $${i}`);
      params.push(q.propertyId);
      i += 1;
    }
    if (q.assignedTo) {
      where.push(`assigned_to = $${i}`);
      params.push(q.assignedTo);
      i += 1;
    }
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        where.push(`(created_at, id) < ($${i}, $${i + 1})`);
        params.push(c.createdAt, c.id);
        i += 2;
      }
    }
    const limit = q.limit;
    params.push(limit + 1);
    const { rows } = await client.query(
      `SELECT id, tenant_id, property_id, kind::text, status::text, severity, title,
              detail AS description,
              payload, assigned_to, guest_id, evidence_id, created_at, resolved_at, resolved_by,
              resolution AS resolution_notes
       FROM exception_queue_items
       ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY severity DESC, created_at DESC, id DESC
       LIMIT $${i}`,
      params,
    );
    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);
    const last = slice.at(-1) as { created_at?: Date; id?: string } | undefined;
    return {
      items: slice,
      nextCursor:
        hasMore && last && last.created_at && last.id
          ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id })
          : null,
      hasMore,
    };
  }

  async get(client: PoolClient, id: string): Promise<unknown> {
    const { rows } = await client.query(
      `SELECT * FROM exception_queue_items WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundError('exception not found');
    return rows[0];
  }

  async patch(
    client: PoolClient,
    id: string,
    input: z.infer<typeof ExceptionPatchRequestSchema>,
    userId: string,
  ): Promise<unknown> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (input.status !== undefined) {
      sets.push(`status = $${i}::exception_status`);
      params.push(input.status);
      i += 1;
      if (input.status === 'resolved' || input.status === 'dismissed') {
        sets.push(`resolved_at = now()`);
        sets.push(`resolved_by = $${i}`);
        params.push(userId);
        i += 1;
      }
    }
    if (input.assignedTo !== undefined) {
      sets.push(`assigned_to = $${i}`);
      params.push(input.assignedTo);
      i += 1;
    }
    if (input.resolutionNotes !== undefined) {
      sets.push(`resolution = $${i}`);
      params.push(input.resolutionNotes);
      i += 1;
    }
    if (input.payloadPatch !== undefined) {
      sets.push(`payload = payload || $${i}::jsonb`);
      params.push(JSON.stringify(input.payloadPatch));
      i += 1;
    }
    if (sets.length === 0) throw new ValidationError('no fields to update');
    params.push(id);
    const { rows } = await client.query(
      `UPDATE exception_queue_items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params,
    );
    if (rows.length === 0) throw new NotFoundError('exception not found');
    return rows[0];
  }
}

export function buildServer(deps: { pool: RoomardPool }): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });
  app.register(sensible);
  applyFramework(app, { serviceName: 'exception', authConfig: authConfigFromEnv() });
  const repo = new ExceptionRepo();

  app.get('/v1/exceptions', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'exception.read');
    const query = ListQuerySchema.parse(req.query ?? {});
    const result = await withPrincipalContext(deps.pool, req, (client) => repo.list(client, query));
    reply(replyHttp, 200, {
      items: result.items,
      page: { size: result.items.length, nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  });

  app.get('/v1/exceptions/:id', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'exception.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const item = await withPrincipalContext(deps.pool, req, (client) => repo.get(client, id));
    reply(replyHttp, 200, item);
  });

  app.patch('/v1/exceptions/:id', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'exception.write');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const body = ExceptionPatchRequestSchema.parse(req.body);
    const item = await withPrincipalContext(deps.pool, req, (client) =>
      repo.patch(client, id, body, principal.userId),
    );
    reply(replyHttp, 200, item);
  });

  return app;
}

function encodeCursor(input: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const app = buildServer({ pool });
  const port = Number.parseInt(process.env.EXCEPTION_PORT ?? '3006', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'exception-svc listening');
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
