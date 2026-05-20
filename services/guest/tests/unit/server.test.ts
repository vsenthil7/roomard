/**
 * Server-level tests for guest-svc using Fastify `app.inject()` + a fake pool.
 * Exercises the HTTP + framework path (auth preHandler, RBAC, JSON parsing,
 * canonical error envelope, /health) without a real database or AI gateway.
 * Routes that call the AI gateway (say-this, trajectory) are exercised only for
 * their auth/RBAC gates here; their AI behaviour is covered in service.test.ts.
 * See docs/TRACEABILITY.md for why this class of test matters (G-28..G-32).
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, mintTestToken, newUuid } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';

describe('guest-svc server', () => {
  let app: FastifyInstance;
  let mgrToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = createFakePool([
      // search returns no rows — proves the route, RBAC, and 200 envelope without
      // needing a fully-shaped guest row (rowToGuest requires every column incl.
      // date fields; row shaping is covered in service.test.ts, not here).
      { match: 'from guests', rows: [] },
    ]);
    app = buildServer({
      pool: pool as unknown as RoomardPool,
      aiGatewayUrl: 'http://localhost:0',
    });
    await app.ready();
    // front_desk_manager has guest.read, guest.write, preference.read
    mgrToken = await mintTestToken({ roles: ['front_desk_manager'] });
  });

  it('/health responds 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /v1/guests without a token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/guests' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { category?: string }).category).toBe('authentication');
  });

  it('GET /v1/guests with manager token returns 200 with items + page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/guests',
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items?: unknown[]; page?: unknown };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBeDefined();
  });

  it('POST /v1/guests with JSON body parses (not 415) and passes RBAC', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/guests',
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'New Guest' }),
    });
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).not.toBe(403);
  });

  it('POST /v1/guests with a read-only role returns 403', async () => {
    const agentToken = await mintTestToken({ roles: ['front_desk_agent'] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/guests',
      headers: { authorization: `Bearer ${agentToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'X' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /v1/guests/:id/preferences passes the preference.read gate', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/guests/${newUuid()}/preferences`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  it('GET /v1/guests/:id with a malformed UUID returns 400 validation envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/guests/not-a-uuid',
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { category?: string }).category).toBe('validation');
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
