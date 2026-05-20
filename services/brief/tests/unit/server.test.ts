/**
 * Server-level tests for brief-svc using Fastify `app.inject()` + a fake pool.
 * Exercises the HTTP + framework path (auth preHandler, RBAC, JSON parsing,
 * canonical error envelope, /health) without a real database or AI gateway.
 * Pipeline behaviour (brief generation, prep-card curation) is covered in
 * pipeline.test.ts and prep-cards.test.ts. See docs/TRACEABILITY.md (G-28..G-32).
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, mintTestToken, newUuid } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';

describe('brief-svc server', () => {
  let app: FastifyInstance;
  let mgrToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    // Empty pool: briefs/today and briefs/:id will 404 (no rows), which is what
    // we want to assert for the read paths without a real DB.
    const pool = createFakePool([]);
    app = buildServer({
      pool: pool as unknown as RoomardPool,
      aiGatewayUrl: 'http://localhost:0',
    });
    await app.ready();
    mgrToken = await mintTestToken({ roles: ['front_desk_manager'] });
  });

  it('/health responds 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /v1/briefs/:id without a token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/v1/briefs/${newUuid()}` });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { category?: string }).category).toBe('authentication');
  });

  it('GET /v1/briefs/:id with empty pool returns 404 canonical envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/briefs/${newUuid()}`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
  });

  it('GET /v1/properties/:id/briefs/today with empty pool returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/properties/${newUuid()}/briefs/today`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/properties/:propertyId/prep-cards/:prepDate rejects a malformed date with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/properties/${newUuid()}/prep-cards/not-a-date`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /v1/properties/:propertyId/prep-cards/:prepDate with a valid date returns 200 items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/properties/${newUuid()}/prep-cards/2026-05-20`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /v1/prep-cards/generate with JSON body parses (not 415) and passes RBAC', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/prep-cards/generate',
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ propertyId: newUuid(), prepDate: '2026-05-20' }),
    });
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).not.toBe(403);
  });

  it('POST /v1/briefs/generate with a read-only role returns 403', async () => {
    // concierge has brief.read but not brief.write
    const conciergeToken = await mintTestToken({ roles: ['concierge'] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/briefs/generate',
      headers: { authorization: `Bearer ${conciergeToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ propertyId: newUuid() }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('unknown route returns 404 canonical envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
  });
});
