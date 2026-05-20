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
      // Insert path returns the created row (RETURNING ...). Must precede the
      // generic `from properties` rules so the INSERT statement matches here.
      {
        match: 'insert into properties',
        rows: [
          {
            id: 'p-new',
            tenant_id: TEST_TENANT_ID,
            name: 'New Hotel',
            short_code: 'NEW',
            timezone: 'Europe/London',
            locale: 'en-GB',
            address_json: null,
            status: 'active',
          },
        ],
      },
      // Dup-check SELECT (WHERE short_code = $1) must return empty so the insert
      // proceeds. Matches before the list/by-id rules via the where clause.
      { match: 'from properties where short_code', rows: [] },
      // GET /v1/properties/:id success
      {
        match: 'from properties where id',
        rows: [
          { id: 'p1', tenant_id: TEST_TENANT_ID, name: 'Demo Hotel', short_code: 'RDH', status: 'active' },
        ],
      },
      {
        match: 'from properties order by name',
        rows: [{ id: 'p1', tenant_id: TEST_TENANT_ID, name: 'Demo Hotel', short_code: 'RDH' }],
      },
      {
        match: 'from roles where tenant_id is null',
        rows: [
          { id: 'r1', tenant_id: null, name: 'admin', description: 'Admin', permissions: { all: ['*'] }, data_classes: [], is_system: true },
        ],
      },
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

  it('POST /v1/properties creates and returns the property (201 + row)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'New Hotel', shortCode: 'NEW', timezone: 'Europe/London' }),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { short_code?: string };
    expect(body.short_code).toBe('NEW');
  });

  it('POST /v1/properties with a duplicate short_code returns 400 validation', async () => {
    // Dedicated pool whose dup-check returns an existing row.
    const dupPool = createFakePool([
      { match: 'from properties where short_code', rows: [{ id: 'existing' }] },
    ]);
    const dupApp = buildServer({ pool: dupPool as unknown as RoomardPool });
    await dupApp.ready();
    const res = await dupApp.inject({
      method: 'POST',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'Dup', shortCode: 'RDH', timezone: 'Europe/London' }),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { category?: string }).category).toBe('validation');
    await dupApp.close();
  });

  it('GET /v1/properties/:id returns 200 and the property', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/properties/00000000-0000-4000-8000-0000000000aa',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { short_code?: string };
    expect(body.short_code).toBe('RDH');
  });

  it('GET /v1/properties/:id with empty pool returns 404 not_found', async () => {
    const emptyPool = createFakePool([]);
    const emptyApp = buildServer({ pool: emptyPool as unknown as RoomardPool });
    await emptyApp.ready();
    const res = await emptyApp.inject({
      method: 'GET',
      url: '/v1/properties/00000000-0000-4000-8000-0000000000aa',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
    await emptyApp.close();
  });

  it('GET /v1/roles returns 200 and an items array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/roles',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items?: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items?.length).toBeGreaterThan(0);
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
