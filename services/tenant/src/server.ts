/**
 * Tenant service — tenant + property + role management.
 * Routes are RBAC-gated; SSO config writes require MFA (enforced upstream by API Gateway).
 */
import sensible from '@fastify/sensible';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { NotFoundError, ValidationError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import {
  PropertyCreateRequestSchema,
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

const log = createLogger({ name: 'tenant-svc' });

export function buildServer(deps: { pool: RoomardPool }): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });
  app.register(sensible);
  applyFramework(app, { serviceName: 'tenant', authConfig: authConfigFromEnv() });

  app.get('/v1/tenant', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'tenant.read');
    await withPrincipalContext(deps.pool, req, async (client) => {
      const { rows } = await client.query(
        `SELECT id, slug, legal_name, tier::text, status::text, data_residency::text, created_at, metadata
         FROM tenants WHERE id = $1`,
        [principal.tenantId],
      );
      if (rows.length === 0) throw new NotFoundError('tenant not found');
      reply(replyHttp, 200, rows[0]);
    });
  });

  app.get('/v1/properties', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'property.read');
    void principal;
    await withPrincipalContext(deps.pool, req, async (client) => {
      const { rows } = await client.query(
        `SELECT id, tenant_id, name, short_code, timezone, locale, address_json, status::text
         FROM properties ORDER BY name ASC`,
      );
      reply(replyHttp, 200, { items: rows });
    });
  });

  app.post('/v1/properties', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'property.write');
    const body = PropertyCreateRequestSchema.parse(req.body);
    await withPrincipalContext(deps.pool, req, async (client) => {
      // Check short_code uniqueness within tenant
      const { rows: dupRows } = await client.query<{ id: string }>(
        `SELECT id FROM properties WHERE short_code = $1`,
        [body.shortCode],
      );
      if (dupRows.length > 0) {
        throw new ValidationError('short_code already in use', {
          existingPropertyId: dupRows[0]!.id,
        });
      }
      const { rows } = await client.query(
        `INSERT INTO properties (
           id, tenant_id, name, short_code, timezone, locale, address_json, status
         ) VALUES (
           gen_random_uuid(),
           current_setting('app.tenant_id', false)::uuid,
           $1, $2, $3, COALESCE($4, 'en-GB'), $5::jsonb, 'active'
         ) RETURNING id, tenant_id, name, short_code, timezone, locale, address_json, status::text`,
        [
          body.name,
          body.shortCode,
          body.timezone,
          body.locale ?? null,
          body.addressJson ? JSON.stringify(body.addressJson) : null,
        ],
      );
      void principal;
      reply(replyHttp, 201, rows[0]);
    });
  });

  app.get('/v1/properties/:id', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'property.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    await withPrincipalContext(deps.pool, req, async (client) => {
      const { rows } = await client.query(
        `SELECT id, tenant_id, name, short_code, timezone, locale, address_json, status::text
         FROM properties WHERE id = $1`,
        [id],
      );
      if (rows.length === 0) throw new NotFoundError('property not found');
      reply(replyHttp, 200, rows[0]);
    });
  });

  app.get('/v1/roles', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'tenant.read');
    await withPrincipalContext(deps.pool, req, async (client) => {
      const { rows } = await client.query(
        `SELECT id, tenant_id, name, description, permissions, data_classes, is_system
         FROM roles WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY name ASC`,
        [principal.tenantId],
      );
      reply(replyHttp, 200, { items: rows });
    });
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const app = buildServer({ pool });
  const port = Number.parseInt(process.env.TENANT_PORT ?? '3002', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'tenant-svc listening');
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
