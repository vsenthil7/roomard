import multipart from '@fastify/multipart';
import sensible from '@fastify/sensible';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { ValidationError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import {
  CardCaptureRequestSchema,
  CaptureMetadataSchema,
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

import {
  ObjectStore,
  objectStoreConfigFromEnv,
  type AnyObjectStore,
} from './object-store.js';
import { processCardCapture } from './pipeline.js';

const log = createLogger({ name: 'capture-svc' });

interface BuildDeps {
  pool: RoomardPool;
  aiGatewayUrl: string;
  objectStore: AnyObjectStore;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function buildServer(deps: BuildDeps): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: MAX_UPLOAD_BYTES + 1024 * 1024,
  });
  app.register(sensible);
  app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  });
  applyFramework(app, { serviceName: 'capture', authConfig: authConfigFromEnv() });

  async function aiInvoke(input: {
    capability: 'ocr.card';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{ output: unknown; modelId: string; latencyMs: number }> {
    const { statusCode, body } = await undiciRequest(`${deps.aiGatewayUrl}/v1/invoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await body.json()) as { output: unknown; modelId: string; latencyMs: number };
    if (statusCode !== 200) throw new Error(`ai gateway returned ${statusCode}`);
    return json;
  }

  app.post('/v1/captures', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'capture.write');

    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let contentType = 'application/octet-stream';
    const formFields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBuffer = Buffer.concat(chunks);
        contentType = part.mimetype;
        if (part.file.truncated) {
          throw new ValidationError('file exceeds maximum size', {
            maxBytes: MAX_UPLOAD_BYTES,
          });
        }
      } else if (part.type === 'field') {
        formFields[part.fieldname] = String(part.value);
      }
    }

    if (!fileBuffer) throw new ValidationError('file part is required');

    let meta;
    try {
      meta = CardCaptureRequestSchema.parse({
        propertyId: formFields.property_id ?? formFields.propertyId,
        guestId: formFields.guest_id ?? formFields.guestId,
        stayId: formFields.stay_id ?? formFields.stayId,
        notes: formFields.notes,
        metadata: CaptureMetadataSchema.parse({
          capturedAt: formFields.captured_at ?? formFields.capturedAt,
          deviceId: formFields.device_id ?? formFields.deviceId,
          geoHint: formFields.geo_hint ?? formFields.geoHint,
          captureSurface: formFields.capture_surface ?? formFields.captureSurface ?? 'mobile_camera',
        }),
      });
    } catch (err) {
      throw err;
    }

    const result = await withPrincipalContext(deps.pool, req, (client) =>
      processCardCapture(
        client,
        { objectStore: deps.objectStore, aiInvoke },
        {
          meta,
          fileBuffer: fileBuffer!,
          contentType,
          tenantId: principal.tenantId,
          requestId: String(req.id),
          userId: principal.userId,
        },
      ),
    );

    reply(replyHttp, 201, result);
  });

  app.get('/v1/captures/:evidenceId', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    requirePermission(principal, 'capture.read');
    const id = UuidSchema.parse((req.params as { evidenceId: string }).evidenceId);
    await withPrincipalContext(deps.pool, req, async (client) => {
      const { rows } = await client.query(
        `SELECT e.id, e.kind, e.status, e.confidence, e.raw_text, e.occurred_at AS captured_at,
                e.property_id, e.guest_id, e.object_ref, c.extracted_fields AS fields_json
         FROM evidence e
         LEFT JOIN card_captures c ON c.evidence_id = e.id
         WHERE e.id = $1`,
        [id],
      );
      if (rows.length === 0) replyHttp.code(404).send({ error: { code: 'NOT_FOUND', message: 'capture not found' } });
      else reply(replyHttp, 200, rows[0]);
    });
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const objectStore = new ObjectStore(objectStoreConfigFromEnv());
  const aiGatewayUrl = process.env.AI_GATEWAY_URL ?? 'http://localhost:3008';
  const app = buildServer({ pool, aiGatewayUrl, objectStore });
  const port = Number.parseInt(process.env.CAPTURE_PORT ?? '3004', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'capture-svc listening');

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
