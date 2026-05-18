import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { request as undiciRequest } from 'undici';
import {
  GuestCreateRequestSchema,
  GuestPatchRequestSchema,
  GuestSearchQuerySchema,
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
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { createLogger } from '@roomard/logger';
import { GuestRepo, buildSayThis } from './service.js';

const log = createLogger({ name: 'guest-svc' });

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
  applyFramework(app, { serviceName: 'guest', authConfig: authConfigFromEnv() });

  const repo = new GuestRepo();

  async function aiInvoke(input: {
    capability: 'llm.brief';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{ output: unknown; modelId: string; promptVersion?: string }> {
    const { statusCode, body } = await undiciRequest(`${deps.aiGatewayUrl}/v1/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await body.json()) as { output: unknown; modelId: string; promptVersion?: string };
    if (statusCode !== 200) {
      throw new Error(`ai gateway returned ${statusCode}`);
    }
    return json;
  }

  app.post('/v1/guests', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'guest.write');
    const body = GuestCreateRequestSchema.parse(req.body);
    const guest = await withPrincipalContext(deps.pool, req, (client) => repo.create(client, body));
    reply(replyHttp, 201, guest);
  });

  app.get('/v1/guests/:id', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'guest.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const guest = await withPrincipalContext(deps.pool, req, (client) => repo.getById(client, id));
    reply(replyHttp, 200, guest);
  });

  app.patch('/v1/guests/:id', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'guest.write');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const body = GuestPatchRequestSchema.parse(req.body);
    const guest = await withPrincipalContext(deps.pool, req, (client) =>
      repo.patch(client, id, body),
    );
    reply(replyHttp, 200, guest);
  });

  app.get('/v1/guests', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'guest.read');
    const query = GuestSearchQuerySchema.parse(req.query ?? {});
    const result = await withPrincipalContext(deps.pool, req, (client) => repo.search(client, query));
    reply(replyHttp, 200, {
      items: result.items,
      page: { size: result.items.length, nextCursor: result.nextCursor, hasMore: result.hasMore },
    });
  });

  app.get('/v1/guests/:id/preferences', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'preference.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const prefs = await withPrincipalContext(deps.pool, req, (client) =>
      repo.getPreferences(client, id),
    );
    reply(replyHttp, 200, { items: prefs });
  });

  app.get('/v1/guests/:id/history', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'guest.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const history = await withPrincipalContext(deps.pool, req, (client) =>
      repo.getHistory(client, id),
    );
    reply(replyHttp, 200, history);
  });

  app.get('/v1/guests/:id/say-this', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'guest.read');
    const id = UuidSchema.parse((req.params as { id: string }).id);
    const suggestion = await withPrincipalContext(deps.pool, req, (client) =>
      buildSayThis(
        client,
        { aiInvoke },
        { guestId: id, tenantId: principal.tenantId, requestId: String(req.id) },
      ),
    );
    reply(replyHttp, 200, suggestion);
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const aiGatewayUrl = process.env.AI_GATEWAY_URL ?? 'http://localhost:3008';
  const app = buildServer({ pool, aiGatewayUrl });
  const port = Number.parseInt(process.env.GUEST_PORT ?? '3003', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'guest-svc listening');

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
