/**
 * Server-level tests for ingest-svc using Fastify `app.inject()` + a fake pool.
 * Exercises the HTTP + framework path (auth preHandler, RBAC, JSON parsing,
 * canonical error envelope, /health, and the public HMAC-gated webhook) without
 * a real database or AI gateway. Review-link pipeline behaviour is covered in
 * review-poller.test.ts. See docs/TRACEABILITY.md (G-28..G-32).
 *
 * Note: ingest registers its OWN application/json content-type parser (parseAs
 * buffer) for the Mews webhook raw-body HMAC need, so handlers read req.body as
 * a Buffer. These tests confirm that path works end to end through inject.
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, mintTestToken, newUuid } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';

describe('ingest-svc server', () => {
  let app: FastifyInstance;
  let gmToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = createFakePool([]);
    app = buildServer({
      pool: pool as unknown as RoomardPool,
      aiGatewayUrl: 'http://localhost:0',
      // No tenant has a configured secret in this fake — webhook auth will fail
      // closed, which is the behaviour we assert.
      webhookSecretLookup: async () => null,
    });
    await app.ready();
    // gm has integration.write (added in CP-40)
    gmToken = await mintTestToken({ roles: ['gm'] });
  });

  it('/health responds 200 (single registration — G-27 regression guard)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { service?: string }).service).toBe('ingest');
  });

  it('POST /v1/reviews/poll without a token returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reviews/poll',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ propertyId: newUuid(), source: 'manual' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/reviews/poll with a role lacking integration.write returns 403', async () => {
    const agentToken = await mintTestToken({ roles: ['front_desk_agent'] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reviews/poll',
      headers: { authorization: `Bearer ${agentToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ propertyId: newUuid(), source: 'manual' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /v1/reviews/poll with gm token + JSON body parses (not 415) and passes RBAC', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reviews/poll',
      headers: { authorization: `Bearer ${gmToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ propertyId: newUuid(), source: 'manual' }),
    });
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
  });

  it('POST /v1/reviews/poll with an invalid source returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/reviews/poll',
      headers: { authorization: `Bearer ${gmToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ propertyId: newUuid(), source: 'not-a-source' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /webhooks/mews without x-tenant-id returns 401 (public path, HMAC-gated)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/mews',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ reservationId: 'r1' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /webhooks/mews with tenant + signature but no configured secret fails closed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/mews',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': newUuid(),
        'x-mews-signature': 'sha256=deadbeef',
      },
      payload: JSON.stringify({ reservationId: 'r1' }),
    });
    // webhookSecretLookup returns null → IntegrationError, not a 2xx.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('unknown route returns 404 canonical envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: { authorization: `Bearer ${gmToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
  });
});
