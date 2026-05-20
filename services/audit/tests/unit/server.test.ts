/**
 * Server-level tests for audit-svc using Fastify `app.inject()` + a fake pool.
 * Exercises the HTTP + framework path (auth preHandler, RBAC, JSON parsing,
 * canonical error envelope, /health) without a real database.
 * See docs/TRACEABILITY.md for why this class of test matters (G-28..G-32).
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, mintTestToken } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';


describe('audit-svc server', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    // queryEvents / verifyChain run their own SELECTs; the fake pool returns
    // empty rows for anything unmatched, which is fine — we assert on status,
    // routing, RBAC and envelopes, not on audit-row contents.
    const pool = createFakePool([
      { match: 'from audit_events', rows: [] },
      { match: 'select', rows: [] },
    ]);
    app = buildServer({ pool: pool as unknown as RoomardPool });
    await app.ready();
    adminToken = await mintTestToken({ roles: ['admin'] });
  });

  it('/health responds 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /v1/audit/events without a token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit/events' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { category?: string }).category).toBe('authentication');
  });

  it('GET /v1/audit/events with admin token returns 200 with items + page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit/events?from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items?: unknown[]; page?: unknown };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBeDefined();
  });

  it('GET /v1/audit/verify without from/to returns 400 validation envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit/verify',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { category?: string }).category).toBe('validation');
  });

  it('POST /v1/audit/export with JSON body parses (not 415)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/audit/export',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        from: '2026-01-01T00:00:00Z',
        to: '2026-12-31T23:59:59Z',
        reason: 'compliance review',
      }),
    });
    expect(res.statusCode).not.toBe(415);
    expect([200, 400]).toContain(res.statusCode);
  });

  it('GET /v1/audit/events with a role lacking audit.read returns 403', async () => {
    const agentToken = await mintTestToken({ roles: ['front_desk_agent'] });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit/events?from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z',
      headers: { authorization: `Bearer ${agentToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('unknown route returns 404 canonical envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
  });
});
