import type { PoolClient } from 'pg';
import { describe, it, expect, vi } from 'vitest';

import { computeHash, verifyChain } from '../../src/service.js';

/**
 * G-37 — these tests were rewritten when the audit service was aligned to the
 * real audit_events schema (event_hash/resource_kind, not hash/resource_type)
 * and verifyChain moved its hash re-derivation INTO SQL (to byte-match the
 * Postgres trigger's concat_ws + occurred_at::text recipe). computeHash is now
 * a pure helper taking the Postgres-rendered occurred_at text + prev-hash hex;
 * verifyChain issues a single query returning per-row {id, hash_ok, link_ok}.
 */

function fakeClient(rows: Array<{ id: string; hash_ok: boolean; link_ok: boolean }>): PoolClient {
  return {
    query: vi.fn(async () => ({ rows })),
    release: vi.fn(),
  } as unknown as PoolClient;
}

describe('computeHash (aligned to migration-0011 canonical recipe)', () => {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    tenant_id: '00000000-0000-4000-8000-0000000000a1',
    actor_kind: 'user',
    actor_id: '00000000-0000-4000-8000-0000000000b1',
    operation: 'create',
    resource_kind: 'guest',
    resource_id: '00000000-0000-4000-8000-0000000000c1',
    data_class: 'A',
  };
  const occurredAt = '2026-05-18 10:00:00+00';

  it('produces a 64-char hex sha256 digest', () => {
    const h = computeHash(base, occurredAt, '');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for identical inputs', () => {
    expect(computeHash(base, occurredAt, '')).toBe(computeHash(base, occurredAt, ''));
  });

  it('changes when the previous-hash hex changes (chain linkage)', () => {
    const a = computeHash(base, occurredAt, '');
    const b = computeHash(base, occurredAt, 'deadbeef');
    expect(a).not.toBe(b);
  });

  it('changes when resource_kind changes', () => {
    const a = computeHash(base, occurredAt, '');
    const b = computeHash({ ...base, resource_kind: 'preference' }, occurredAt, '');
    expect(a).not.toBe(b);
  });

  it('changes when occurred_at text changes', () => {
    const a = computeHash(base, occurredAt, '');
    const b = computeHash(base, '2026-05-18 10:00:01+00', '');
    expect(a).not.toBe(b);
  });

  it('treats null actor_id / data_class as empty string', () => {
    const withNulls = computeHash(
      { ...base, actor_id: null, data_class: null },
      occurredAt,
      '',
    );
    // Equivalent to passing empty strings explicitly.
    const withEmpties = computeHash(
      { ...base, actor_id: '' as unknown as string, data_class: '' },
      occurredAt,
      '',
    );
    expect(withNulls).toBe(withEmpties);
  });
});

describe('verifyChain (SQL-derived hash_ok / link_ok)', () => {
  it('returns ok when every row reports hash_ok and link_ok', async () => {
    const client = fakeClient([
      { id: 'r1', hash_ok: true, link_ok: true },
      { id: 'r2', hash_ok: true, link_ok: true },
    ]);
    const res = await verifyChain(client, 't1', '2026-05-18T00:00:00Z', '2026-05-19T00:00:00Z');
    expect(res.ok).toBe(true);
    expect(res.rowsChecked).toBe(2);
    expect(res.brokenAtRowId).toBeNull();
  });

  it('flags a hash mismatch at the offending row', async () => {
    const client = fakeClient([
      { id: 'r1', hash_ok: true, link_ok: true },
      { id: 'r2', hash_ok: false, link_ok: true },
    ]);
    const res = await verifyChain(client, 't1', '2026-05-18T00:00:00Z', '2026-05-19T00:00:00Z');
    expect(res.ok).toBe(false);
    expect(res.brokenAtRowId).toBe('r2');
    expect(res.reason).toMatch(/hash mismatch/);
  });

  it('flags broken previous_hash linkage at the offending row', async () => {
    const client = fakeClient([
      { id: 'r1', hash_ok: true, link_ok: true },
      { id: 'r2', hash_ok: true, link_ok: false },
    ]);
    const res = await verifyChain(client, 't1', '2026-05-18T00:00:00Z', '2026-05-19T00:00:00Z');
    expect(res.ok).toBe(false);
    expect(res.brokenAtRowId).toBe('r2');
    expect(res.reason).toMatch(/previous_hash/);
  });

  it('returns ok with zero rows for an empty range', async () => {
    const client = fakeClient([]);
    const res = await verifyChain(client, 't1', '2026-05-18T00:00:00Z', '2026-05-19T00:00:00Z');
    expect(res.ok).toBe(true);
    expect(res.rowsChecked).toBe(0);
  });
});
