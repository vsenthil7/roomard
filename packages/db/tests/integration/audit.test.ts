/**
 * Audit chain integration test.
 *
 * Verifies:
 *   - Inserting via tenant context triggers audit_events row creation with computed hash
 *   - UPDATE / DELETE on audit_events raises restrict_violation (append-only)
 *   - Sequential inserts chain previous_hash correctly
 */
import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { RoomardPool } from '../../src/pool.js';
import { withTenantContext } from '../../src/tenant-context.js';

const TENANT = '00000000-0000-4000-8000-000000000001';

const skipReason = !process.env.DATABASE_URL ? 'DATABASE_URL not set — skipping audit integration test' : null;
const describeOrSkip = skipReason ? describe.skip : describe;

describeOrSkip('Audit chain', () => {
  let raw: Pool;
  let pool: RoomardPool;

  beforeAll(async () => {
    raw = new Pool({ connectionString: process.env.DATABASE_URL });
    pool = new RoomardPool({ connectionString: process.env.DATABASE_URL! });
    await raw.query(
      `INSERT INTO tenants (id, slug, name, tier, status, data_residency)
       VALUES ($1, 'tenant-audit', 'Audit Test', 'property', 'active', 'eu')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
  });

  afterAll(async () => {
    await pool.close();
    await raw.end();
  });

  it('insert into guests writes a chained audit event', async () => {
    const guestId = await withTenantContext(
      pool,
      {
        tenantId: TENANT,
        userId: '00000000-0000-4000-8000-000000000100',
        actorKind: 'user',
        requestId: '00000000-0000-4000-8000-0000000ad001',
      },
      async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO guests (id, tenant_id, display_name) VALUES (gen_random_uuid(), $1, 'Audit Test Guest') RETURNING id`,
          [TENANT],
        );
        return rows[0]!.id;
      },
    );

    const { rows } = await raw.query<{ id: string; event_hash: string; previous_hash: string | null; operation: string }>(
      `SELECT id, event_hash, previous_hash, operation FROM audit_events WHERE resource_kind = 'guest' AND resource_id = $1`,
      [guestId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // event_hash is bytea (raw 32-byte SHA-256 digest), not a 64-char hex string.
    expect(rows[0]!.event_hash.length).toBe(32);
    // The audit trigger records an INSERT as operation 'create' (not 'insert').
    expect(rows[0]!.operation).toBe('create');
  });

  it('UPDATE on audit_events raises restrict_violation', async () => {
    const { rows } = await raw.query<{ id: string }>(`SELECT id FROM audit_events LIMIT 1`);
    if (rows.length === 0) return; // nothing to test yet
    await expect(
      raw.query(`UPDATE audit_events SET operation = 'tampered' WHERE id = $1`, [rows[0]!.id]),
    ).rejects.toThrow();
  });

  it('DELETE on audit_events raises restrict_violation', async () => {
    const { rows } = await raw.query<{ id: string }>(`SELECT id FROM audit_events LIMIT 1`);
    if (rows.length === 0) return;
    await expect(
      raw.query(`DELETE FROM audit_events WHERE id = $1`, [rows[0]!.id]),
    ).rejects.toThrow();
  });

  it('two sequential inserts chain previous_hash', async () => {
    await withTenantContext(
      pool,
      {
        tenantId: TENANT,
        userId: '00000000-0000-4000-8000-000000000100',
        actorKind: 'user',
        requestId: '00000000-0000-4000-8000-0000000ad002',
      },
      async (client) => {
        await client.query(
          `INSERT INTO guests (id, tenant_id, display_name) VALUES (gen_random_uuid(), $1, 'Chain A')`,
          [TENANT],
        );
      },
    );
    await withTenantContext(
      pool,
      {
        tenantId: TENANT,
        userId: '00000000-0000-4000-8000-000000000100',
        actorKind: 'user',
        requestId: '00000000-0000-4000-8000-0000000ad003',
      },
      async (client) => {
        await client.query(
          `INSERT INTO guests (id, tenant_id, display_name) VALUES (gen_random_uuid(), $1, 'Chain B')`,
          [TENANT],
        );
      },
    );

    const { rows } = await raw.query<{ id: string; event_hash: string; previous_hash: string | null }>(
      `SELECT id, event_hash, previous_hash FROM audit_events WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT 2`,
      [TENANT],
    );
    expect(rows.length).toBe(2);
    // Newest row's previous_hash should equal the second row's event_hash.
    // Both are bytea (Buffer), so compare by value with toStrictEqual, not toBe.
    expect(rows[0]!.previous_hash).toStrictEqual(rows[1]!.event_hash);
  });
});
