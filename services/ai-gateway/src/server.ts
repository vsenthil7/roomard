import sensible from '@fastify/sensible';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { toSerializedError, isRoomardError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { AiGateway, gatewayConfigFromEnv } from './index.js';

const log = createLogger({ name: 'ai-gateway.http' });

const InvokeBodySchema = z.object({
  capability: z.enum(['ocr.card', 'llm.brief', 'llm.review_link', 'llm.reasoning']),
  tenantId: z.string().uuid(),
  payload: z.unknown(),
});

export function buildServer(deps: { pool: RoomardPool; gateway: AiGateway }): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 25 * 1024 * 1024,
  });

  app.register(sensible);

  app.addHook('onRequest', async (req) => {
    log.debug({ requestId: req.id, url: req.url, method: req.method }, 'ai-gateway request');
  });

  app.setErrorHandler((err, req, reply) => {
    if (isRoomardError(err)) {
      reply.code(err.status).send(toSerializedError(err, String(req.id)));
      return;
    }
    log.error({ err, requestId: req.id }, 'ai-gateway unhandled error');
    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: req.id,
      },
    });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/v1/invoke', async (req, reply) => {
    const body = InvokeBodySchema.parse(req.body);
    const result = await deps.gateway.invoke({
      capability: body.capability,
      tenantId: body.tenantId,
      requestId: String(req.id),
      payload: body.payload,
    });
    reply.send(result);
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const gateway = new AiGateway(pool, gatewayConfigFromEnv());
  const app = buildServer({ pool, gateway });
  const port = Number.parseInt(process.env.AI_GATEWAY_PORT ?? '3008', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'ai-gateway listening');

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await app.close();
    await pool.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1]?.includes('server')) {
  start().catch((err) => {
    log.error({ err }, 'failed to start');
    process.exit(1);
  });
}
