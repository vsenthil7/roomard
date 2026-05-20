/**
 * RLS integration test.
 *
 * Requires Postgres + roomard schema (run `make db-migrate db-seed` first).
 * Verifies:
 *   - With app.tenant_id GUC set to tenant A, queries see only tenant-A rows
 *   - With it set to tenant B, queries see only tenant-B rows
 *   - With it unset, RLS denies all reads on protected tables
 *
 * IMPORTANT (G-36): the dev/CI `roomard` role is provisioned as a SUPERUSER with
 * BYPASSRLS. Superuser / BYPASSRLS roles ignore row-level security entirely — even
 * when the table has FORCE ROW LEVEL SECURITY. So a connection as `roomard` does NOT
 * exercise RLS and cannot prove tenant isolation. To genuinely verify RLS, this test
 * creates a dedicated restricted role (NOSUPERUSER NOBYPASSRLS) and runs the
 * isolation assertions through that role. The need for this is itself the finding:
 * the application must connect to production Postgres as a non-superuser,
 * non-BYPASSRLS role or RLS provides no protection. Tracked as G-36.
 */
import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { RoomardPool } from '../../src/pool.js';
import { withTenantContext } from '../../src/tenant-context.js';

const DEMO_TENANT_A = '00000000-0000-4000-8000-000000000001';
const DEMO_TENANT_B = '00000000-0000-4000-8000-000000000002';

// A restricted role used purely to exercise RLS (the app role bypasses it — G-36).
const RLS_ROLE = 'roomard_rls_test';
const RLS_ROLE_PWD = 'rls_test_pwd';

const skipReason = !process.env.DATABASE_URL ? 'DATABASE_URL not set — skipping RLS integration test' : null;

const describeOrSkip = skipReason ? describe.skip : describe;

function restrictedConnString(): string {
  const base = new URL(process.env.DATABASE_URL!);
  base.username = RLS_ROLE;
  base.password = RLS_ROLE_PWD;
  return base.toString();
}

describeOrSkip('RLS isolation', () => {
  let raw: Pool;
  let restricted: RoomardPool;

  beforeAll(async () => {
    raw = new Pool({ connectionString: process.env.DATABASE_URL });

    // Seed two tenants if not present.
    await raw.query(
      `INSERT INTO tenants (id, slug, name, tier, status, data_residency)
       VALUES ($1, 'tenant-a', 'Tenant A', 'property', 'active', 'eu')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT_A],
    );
    await raw.query(
      `INSERT INTO tenants (id, slug, name, tier, status, data_residency)
       VALUES ($1, 'tenant-b', 'Tenant B', 'property', 'active', 'eu')
       ON CONFLICT (id) DO NOTHING`,
      [DEMO_TENANT_B],
    );

    // Seed one guest per tenant (as the app/superuser role; RLS bypassed for setup).
    const client = await raw.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.tenant_id = '${DEMO_TENANT_A}'`);
      await client.query(`SET LOCAL app.user_id = '00000000-0000-4000-8000-000000000100'`);
      await client.query(`SET LOCAL app.actor_kind = 'user'`);
      await client.query(`SET LOCAL app.request_id = '00000000-0000-4000-8000-0000000aa001'`);
      await client.query(
        `INSERT INTO guests (id, tenant_id, display_name) VALUES (gen_random_uuid(), $1, 'Alice RLS Test')
         ON CONFLICT DO NOTHING`,
        [DEMO_TENANT_A],
      );
      await client.query('COMMIT');

      await client.query('BEGIN');
      await client.query(`SET LOCAL app.tenant_id = '${DEMO_TENANT_B}'`);
      await client.query(`SET LOCAL app.user_id = '00000000-0000-4000-8000-000000000101'`);
      await client.query(`SET LOCAL app.actor_kind = 'user'`);
      await client.query(`SET LOCAL app.request_id = '00000000-0000-4000-8000-0000000bb001'`);
      await client.query(
        `INSERT INTO guests (id, tenant_id, display_name) VALUES (gen_random_uuid(), $1, 'Bob RLS Test')
         ON CONFLICT DO NOTHING`,
        [DEMO_TENANT_B],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Provision a restricted role that does NOT bypass RLS, so the isolation
    // assertions below genuinely exercise the row-level policies (G-36).
    await raw.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_ROLE}') THEN
           CREATE ROLE ${RLS_ROLE} LOGIN PASSWORD '${RLS_ROLE_PWD}' NOSUPERUSER NOBYPASSRLS;
         ELSE
           ALTER ROLE ${RLS_ROLE} NOSUPERUSER NOBYPASSRLS;
         END IF;
       END
       $$;`,
    );
    await raw.query(`GRANT USAGE ON SCHEMA public TO ${RLS_ROLE}`);
    await raw.query(`GRANT SELECT ON guests TO ${RLS_ROLE}`);

    restricted = new RoomardPool({ connectionString: restrictedConnString() });
  });

  afterAll(async () => {
    if (restricted) await restricted.close();
    await raw.end();
  });

  it('the app role is a superuser/bypassrls — documents the G-36 provisioning gap', async () => {
    const { rows } = await raw.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    // This assertion records reality rather than asserting the desired end-state:
    // in the dev/CI container the app role bypasses RLS, which is why the
    // isolation checks below must use a restricted role. When provisioning is
    // fixed (G-36) the app role should be NOSUPERUSER NOBYPASSRLS.
    expect(rows[0]).toBeDefined();
    expect(rows[0]!.rolsuper || rows[0]!.rolbypassrls).toBe(true);
  });

  it('tenant A context (restricted role) sees only tenant A guests', async () => {
    const rows = await withTenantContext(
      restricted,
      {
        tenantId: DEMO_TENANT_A,
        userId: '00000000-0000-4000-8000-000000000100',
        actorKind: 'user',
        requestId: '00000000-0000-4000-8000-0000000aa002',
      },
      async (client) => {
        const { rows } = await client.query<{ id: string; tenant_id: string }>(
          `SELECT id, tenant_id FROM guests`,
        );
        return rows;
      },
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.tenant_id).toBe(DEMO_TENANT_A);
    }
  });

  it('tenant B context (restricted role) sees only tenant B guests', async () => {
    const rows = await withTenantContext(
      restricted,
      {
        tenantId: DEMO_TENANT_B,
        userId: '00000000-0000-4000-8000-000000000101',
        actorKind: 'user',
        requestId: '00000000-0000-4000-8000-0000000bb002',
      },
      async (client) => {
        const { rows } = await client.query<{ id: string; tenant_id: string }>(
          `SELECT id, tenant_id FROM guests`,
        );
        return rows;
      },
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.tenant_id).toBe(DEMO_TENANT_B);
    }
  });

  it('without app.tenant_id the restricted role sees zero guests (RLS denies)', async () => {
    const client = await restricted.connect();
    try {
      const { rows } = await client.query<{ id: string }>(`SELECT id FROM guests`);
      // Under FORCE RLS with no app.tenant_id GUC set, the policy matches nothing.
      expect(rows.length).toBe(0);
    } finally {
      client.release();
    }
  });
});
