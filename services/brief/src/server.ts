import sensible from '@fastify/sensible';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { NotFoundError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import {
  BriefGenerateRequestSchema,
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
import { request as undiciRequest } from 'undici';

import { generateBrief, loadBriefById } from './pipeline.js';

const log = createLogger({ name: 'brief-svc' });

interface BuildDeps {
  pool: RoomardPool;
  aiGatewayUrl: string;
}

export function buildServer(deps: BuildDeps): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });
  app.register(sensible);
  applyFramework(app, { serviceName: 'brief', authConfig: authConfigFromEnv() });

  async function aiInvoke(input: {
    capability: 'llm.brief';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{ output: unknown; modelId: string; latencyMs: number; promptVersion?: string }> {
    const { statusCode, body } = await undiciRequest(`${deps.aiGatewayUrl}/v1/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await body.json()) as {
      output: unknown;
      modelId: string;
      latencyMs: number;
      promptVersion?: string;
    };
    if (statusCode !== 200) throw new Error(`ai gateway returned ${statusCode}`);
    return json;
  }

  app.post('/v1/briefs/generate', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'brief.write');
    const body = BriefGenerateRequestSchema.parse(req.body);
    const briefDate = body.briefDate ?? new Date().toISOString().slice(0, 10);
    const summary = await withPrincipalContext(deps.pool, req, (client) =>
      generateBrief(
        client,
        { aiInvoke },
        {
          tenantId: principal.tenantId,
          propertyId: body.propertyId,
          briefDate,
          requestId: String(req.id),
          force: body.force ?? false,
        },
      ),
    );
    reply(replyHttp, 201, summary);
  });

  app.get('/v1/properties/:propertyId/briefs/today', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'brief.read');
    const propertyId = UuidSchema.parse((req.params as { propertyId: string }).propertyId);
    const today = new Date().toISOString().slice(0, 10);

    await withPrincipalContext(deps.pool, req, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM briefs WHERE property_id = $1 AND brief_date = $2`,
        [propertyId, today],
      );
      if (rows.length === 0) throw new NotFoundError('no brief for today');
      const detail = await loadBriefById(client, rows[0]!.id);
      reply(replyHttp, 200, detail);
    });
  });

  app.get('/v1/briefs/:id', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'brief.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    await withPrincipalContext(deps.pool, req, async (client) => {
      const detail = await loadBriefById(client, id);
      if (!detail) throw new NotFoundError('brief not found');
      reply(replyHttp, 200, detail);
    });
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const aiGatewayUrl = process.env.AI_GATEWAY_URL ?? 'http://localhost:3008';
  const app = buildServer({ pool, aiGatewayUrl });
  const port = Number.parseInt(process.env.BRIEF_PORT ?? '3005', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'brief-svc listening');

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
