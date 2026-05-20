/**
 * Server-level tests for tenant-svc using Fastify `app.inject()` + a fake pool.
 *
 * These exercise the full HTTP + framework path (content-type parsing, the auth
 * preHandler, RBAC via requirePermission, the canonical error envelope, and
 * `/health`) without a real database. This is the class of test that was missing
 * across the services and let the G-28..G-32 cascade stay hidden until the live
 * smoke test — see docs/TRACEABILITY.md.
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, mintTestToken, TEST_TENANT_ID } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';


describe('tenant-svc server', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = createFakePool([
      {
        match: 'from tenants where id',
        rows: [
          {
            id: TEST_TENANT_ID,
            slug: 'demo',
            legal_name: 'Roomard Demo Hotels',
            tier: 'group',
            status: 'active',
            data_residency: 'eu',
            created_at: new Date().toISOString(),
            metadata: {},
          },
        ],
      },
      {
        match: 'from properties order by name',
        rows: [{ id: 'p1', tenant_id: TEST_TENANT_ID, name: 'Demo Hotel', short_code: 'RDH' }],
      },
      { match: 'from roles where tenant_id is null', rows: [{ id: 'r1', name: 'admin' }] },
    ]);
    app = buildServer({ pool: pool as unknown as RoomardPool });
    await app.ready();
    adminToken = await mintTestToken({ roles: ['admin'] });
  });

  it('/health responds 200 (framework-registered, no auth)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('GET /v1/tenant without a bearer token returns 401 canonical envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/tenant' });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { code?: string; category?: string };
    expect(body.category).toBe('authentication');
  });

  it('GET /v1/tenant with an admin token returns 200 and the tenant row', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/tenant',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { slug?: string };
    expect(body.slug).toBe('demo');
  });

  it('GET /v1/properties with admin token returns 200 and an items array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /v1/properties with a JSON body is parsed (not 415) and validates', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'New Hotel', shortCode: 'NEW', timezone: 'Europe/London' }),
    });
    // 201 created (fake pool returns no dup, then the insert rule is unmatched so
    // rows: [] — the handler still replies 201 with the row). What we're proving:
    // the JSON body parsed (no 415) and RBAC passed (no 403).
    expect([200, 201]).toContain(res.statusCode);
  });

  it('POST /v1/properties with insufficient permission returns 403', async () => {
    const agentToken = await mintTestToken({ roles: ['front_desk_agent'] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${agentToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'X', shortCode: 'X', timezone: 'Europe/London' }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('unknown route returns 404 canonical envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nonexistent',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { category?: string };
    expect(body.category).toBe('not_found');
  });
});
