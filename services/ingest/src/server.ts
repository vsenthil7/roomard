/**
 * Ingest service.
 *
 * - POST /webhooks/mews: receives reservation/booking events. Verifies HMAC-SHA256
 *   signature against the per-integration secret, then upserts the stay row.
 * - Stub pollers for TripAdvisor / Booking.com / Google. Behind feature flag for MVP.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { z } from 'zod';
import { AuthenticationError, IntegrationError, NotFoundError } from '@roomard/errors';
import { RoomardPool, dbConfigFromEnv, withTenantContext } from '@roomard/db';
import { createLogger } from '@roomard/logger';

const log = createLogger({ name: 'ingest-svc' });

const MewsReservationSchema = z.object({
  reservationId: z.string().min(1),
  guestId: z.string().min(1),
  guestDisplayName: z.string().min(1),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  propertyId: z.string().uuid(),
  arrivalAt: z.string().datetime({ offset: true }),
  departureAt: z.string().datetime({ offset: true }),
  roomNumber: z.string().nullable().optional(),
  status: z.enum(['booked', 'expected', 'checked_in', 'checked_out', 'cancelled']),
  loyaltyTier: z.string().optional(),
});

export function verifyMewsSignature(
  rawBody: Buffer,
  providedSignature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // Strip "sha256=" prefix if present
  const normalized = providedSignature.replace(/^sha256=/i, '');
  if (normalized.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(normalized, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export interface IngestDeps {
  pool: RoomardPool;
  webhookSecretLookup(tenantId: string, integrationKind: 'mews'): Promise<string | null>;
}

export async function ingestMewsReservation(
  client: PoolClient,
  tenantId: string,
  input: z.infer<typeof MewsReservationSchema>,
): Promise<{ guestId: string; stayId: string; status: 'created' | 'updated' }> {
  // 1. Confirm property exists
  const { rows: propRows } = await client.query<{ id: string }>(
    `SELECT id FROM properties WHERE id = $1`,
    [input.propertyId],
  );
  if (propRows.length === 0) throw new NotFoundError('property not found');

  // 2. Upsert guest by Mews guest_id stored in pms_guest_ids JSONB
  const { rows: guestRows } = await client.query<{ id: string }>(
    `SELECT id FROM guests WHERE pms_guest_ids ? 'mews' AND pms_guest_ids ->> 'mews' = $1 LIMIT 1`,
    [input.guestId],
  );
  let guestId: string;
  if (guestRows.length > 0) {
    guestId = guestRows[0]!.id;
    await client.query(
      `UPDATE guests SET display_name = $1, updated_at = now() WHERE id = $2`,
      [input.guestDisplayName, guestId],
    );
  } else {
    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO guests (
         id, tenant_id, display_name, email, phone_e164, pms_guest_ids, loyalty_tiers
       ) VALUES (
         gen_random_uuid(),
         current_setting('app.tenant_id', false)::uuid,
         $1, $2, $3, jsonb_build_object('mews', $4::text),
         $5::jsonb
       ) RETURNING id`,
      [
        input.guestDisplayName,
        input.guestEmail ?? null,
        input.guestPhone ?? null,
        input.guestId,
        input.loyaltyTier ? JSON.stringify({ mews: input.loyaltyTier }) : '{}',
      ],
    );
    guestId = ins[0]!.id;
  }

  // 3. Upsert stay
  const { rows: stayRows } = await client.query<{ id: string; was_inserted: boolean }>(
    `INSERT INTO stays (
       id, tenant_id, property_id, guest_id,
       pms_provider, pms_booking_id,
       arrival_at, departure_at, room_number, status
     ) VALUES (
       gen_random_uuid(),
       current_setting('app.tenant_id', false)::uuid,
       $1, $2,
       'mews', $3,
       $4, $5, $6, $7::stay_status
     )
     ON CONFLICT (tenant_id, pms_provider, pms_booking_id) DO UPDATE SET
       arrival_at = EXCLUDED.arrival_at,
       departure_at = EXCLUDED.departure_at,
       room_number = EXCLUDED.room_number,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING id, (xmax = 0) AS was_inserted`,
    [
      input.propertyId,
      guestId,
      input.reservationId,
      input.arrivalAt,
      input.departureAt,
      input.roomNumber ?? null,
      input.status,
    ],
  );

  return {
    guestId,
    stayId: stayRows[0]!.id,
    status: stayRows[0]!.was_inserted ? 'created' : 'updated',
  };
}

export function buildServer(deps: IngestDeps): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });
  app.register(sensible);

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.get('/health', async () => ({ status: 'ok', service: 'ingest' }));

  app.post('/webhooks/mews', async (req, reply) => {
    const rawBody = req.body as Buffer;
    const signature = String(req.headers['x-mews-signature'] ?? '');
    const tenantId = String(req.headers['x-tenant-id'] ?? '');
    if (!tenantId) throw new AuthenticationError('missing x-tenant-id header');
    if (!signature) throw new AuthenticationError('missing x-mews-signature');
    const secret = await deps.webhookSecretLookup(tenantId, 'mews');
    if (!secret) throw new IntegrationError('mews integration not configured for tenant');
    if (!verifyMewsSignature(rawBody, signature, secret)) {
      throw new AuthenticationError('invalid webhook signature');
    }
    let parsed: z.infer<typeof MewsReservationSchema>;
    try {
      parsed = MewsReservationSchema.parse(JSON.parse(rawBody.toString('utf8')));
    } catch (err) {
      log.warn({ err }, 'invalid mews payload');
      reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'invalid payload' } });
      return;
    }
    const result = await withTenantContext(
      deps.pool,
      {
        tenantId,
        actorKind: 'integration',
        actorLabel: 'mews-webhook',
        requestId: String(req.id),
      },
      (client) => ingestMewsReservation(client, tenantId, parsed),
    );
    reply.code(200).send({ status: 'accepted', ...result });
  });

  return app;
}

export async function defaultSecretLookup(
  pool: RoomardPool,
  tenantId: string,
  kind: 'mews',
): Promise<string | null> {
  const { rows } = await pool.query<{ credentials_ref: string }>(
    `SELECT credentials_ref FROM integrations WHERE tenant_id = $1::uuid AND kind = $2::integration_kind AND status = 'active' LIMIT 1`,
    [tenantId, kind],
  );
  if (rows.length === 0) return null;
  // In prod: resolve credentials_ref via secrets manager. For dev/test, env override.
  return process.env[`INTEGRATION_SECRET_${rows[0]!.credentials_ref}`] ?? process.env.MEWS_WEBHOOK_SECRET ?? null;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const app = buildServer({
    pool,
    webhookSecretLookup: (tenantId, kind) => defaultSecretLookup(pool, tenantId, kind),
  });
  const port = Number.parseInt(process.env.INGEST_PORT ?? '3009', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'ingest-svc listening');
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
