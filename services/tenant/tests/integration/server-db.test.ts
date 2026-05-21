/**
 * Tenant service — REAL database integration tests (the G-42 regression guard).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The unit tests in tests/unit/server.test.ts build the server with createFakePool
 * and hand-feed rows that include `legal_name` (on tenants) and `address_json`
 * (on properties). Neither column exists in the real schema — the real `tenants`
 * table has `name`, and the real `properties` table stores the address in discrete
 * columns (address_line1/2, city, postal_code, country_code). Because the fake pool
 * just echoes whatever rows the test typed, the unit tests passed against those
 * phantom columns while GET /v1/tenant and GET/POST /v1/properties all returned
 * HTTP 500 in production. That is G-42, and it was invisible until the live demo.
 *
 * This suite builds the SAME server via buildServer() but backs it with a REAL
 * RoomardPool, then drives the real HTTP routes with app.inject(). The inline SQL
 * in each handler therefore runs against real Postgres; any reference to a column
 * that does not exist raises 42703 and the request 500s, failing the test. That is
 * the protection the fake-pool unit tests cannot provide.
 *
 * GATING: skips cleanly when DATABASE_URL is unset.
 */
import { RoomardPool } from '@roomard/db';
import { mintTestToken } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../../src/server.js';

const TENANT = '00000000-0000-4000-8000-000000000001';
// A property id + short_code unique to this suite, so pre-existing seed data (which
// may already occupy the standard demo property id) cannot collide with assertions.
const READ_PROP_ID = '00000000-0000-4000-8000-0000000f2010';
const READ_SHORT_CODE = 'ITRD';

const skipReason = !process.env.DATABASE_URL
  ? 'DATABASE_URL not set — skipping tenant-svc DB integration tests'
  : null;
const describeOrSkip = skipReason ? describe.skip : describe;

if (skipReason) {
  // eslint-disable-next-line no-console
  console.log(`[tenant integration] ${skipReason}`);
}

describeOrSkip('tenant-svc · real-DB integration (G-42 regression guard)', () => {
  let app: FastifyInstance;
  let pool: RoomardPool;
  let raw: Pool;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    raw = new Pool({ connectionString: process.env.DATABASE_URL });
    pool = new RoomardPool({ connectionString: process.env.DATABASE_URL! });

    // Ensure the tenant + a dedicated, uniquely-identified property exist for the read
    // paths. We use our OWN property id (not the shared seed id) so pre-existing seed
    // data can't collide with our assertions.
    await raw.query(
      `INSERT INTO tenants (id, slug, name, tier, status, data_residency)
       VALUES ($1, 'demo', 'Roomard Demo Hotels', 'group', 'active', 'eu')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    await raw.query(
      `INSERT INTO properties (id, tenant_id, name, short_code, timezone, locale,
                               address_line1, city, postal_code, country_code, status)
       VALUES ($1, $2, 'IT Read Hotel', $3, 'Europe/London', 'en-GB',
               '1 Demo Street', 'London', 'EC1A 1BB', 'GB', 'active')
       ON CONFLICT (id) DO UPDATE SET
         short_code = EXCLUDED.short_code,
         address_line1 = EXCLUDED.address_line1,
         city = EXCLUDED.city,
         postal_code = EXCLUDED.postal_code,
         country_code = EXCLUDED.country_code`,
      [READ_PROP_ID, TENANT, READ_SHORT_CODE],
    );

    app = buildServer({ pool });
    await app.ready();
    // Token must carry the REAL tenant id so RLS/tenant-context resolves to seeded rows.
    adminToken = await mintTestToken({ roles: ['admin'], tenantId: TENANT });
  });

  afterAll(async () => {
    await app.close();
    await pool.close();
    await raw.end();
  });

  it('GET /v1/tenant runs the real SELECT on `tenants` (would 42703 on the pre-fix `legal_name` column)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/tenant',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { slug?: string; legal_name?: string };
    expect(body.slug).toBe('demo');
    // legal_name in the response is the real `name` column aliased.
    expect(body.legal_name).toBe('Roomard Demo Hotels');
  });

  it('GET /v1/properties runs the real SELECT on `properties` (would 42703 on the pre-fix `address_json` column)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { items?: Array<{ id: string; address_json?: Record<string, unknown> }> };
    expect(Array.isArray(body.items)).toBe(true);
    const demo = body.items!.find((p) => p.id === READ_PROP_ID);
    expect(demo, 'seeded property should be listed').toBeTruthy();
    // address_json is rebuilt from the discrete columns via jsonb_build_object
    // (note: the server emits snake_case keys here).
    expect(demo!.address_json).toMatchObject({ line1: '1 Demo Street', city: 'London', country_code: 'GB' });
  });

  it('GET /v1/properties/:id runs the real by-id SELECT (same address_json rebuild)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/properties/${READ_PROP_ID}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { short_code?: string; address_json?: Record<string, unknown> };
    expect(body.short_code).toBe(READ_SHORT_CODE);
    expect(body.address_json).toMatchObject({ postal_code: 'EC1A 1BB' });
  });

  it('POST /v1/properties runs the real INSERT writing discrete address columns (would 42703 on the pre-fix address_json insert)', async () => {
    const shortCode = `IT${Date.now() % 100000}`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/properties',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({
        name: 'Inserted Hotel',
        shortCode,
        timezone: 'Europe/London',
        addressJson: { line1: '2 New Road', city: 'Bath', postalCode: 'BA1 1AA', countryCode: 'GB' },
      }),
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { short_code?: string; address_json?: Record<string, unknown> };
    expect(body.short_code).toBe(shortCode);
    // The INSERT wrote discrete columns from $5::jsonb->>'...'; the RETURNING rebuilds address_json.
    expect(body.address_json).toMatchObject({ line1: '2 New Road', city: 'Bath' });
  });

  it('the real schema genuinely lacks the phantom columns G-42 referenced (proves the tests above have teeth)', async () => {
    const cols = await raw.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_name IN ('tenants','properties')`,
    );
    const set = new Set(cols.rows.map((r) => `${r.table_name}.${r.column_name}`));
    expect(set.has('tenants.legal_name')).toBe(false); // real col is `name`
    expect(set.has('properties.address_json')).toBe(false); // real cols are discrete
    expect(set.has('tenants.name')).toBe(true);
    expect(set.has('properties.address_line1')).toBe(true);
    expect(set.has('properties.country_code')).toBe(true);
  });
});
