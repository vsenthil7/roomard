import { describe, it, expect, vi } from 'vitest';
import { computeHash, verifyChain } from '../src/service.js';
import type { AuditRow } from '../src/service.js';

function makeRow(over: Partial<AuditRow>): AuditRow {
  return {
    id: 'r1',
    occurred_at: new Date('2026-05-18T10:00:00.000Z'),
    tenant_id: 't1',
    actor_kind: 'user',
    actor_id: 'u1',
    actor_label: null,
    operation: 'update',
    resource_type: 'guest',
    resource_id: 'g1',
    request_id: null,
    ip_inet: null,
    user_agent: null,
    data_class: 'A',
    payload_hash: 'p1',
    previous_hash: null,
    hash: 'placeholder',
    ...over,
  };
}

function fakeClient(handlers: Array<(sql: string, params: unknown[]) => { rows: unknown[] }>) {
  let idx = 0;
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const h = handlers[idx];
      if (!h) throw new Error(`unexpected query #${idx + 1}: ${sql.slice(0, 60)}`);
      idx += 1;
      return h(sql, params);
    }),
    release: vi.fn(),
  } as unknown as import('pg').PoolClient;
}

describe('computeHash', () => {
  it('is stable for the same content', () => {
    const r = makeRow({});
    expect(computeHash(r)).toBe(computeHash(r));
  });

  it('changes when payload_hash changes', () => {
    const r1 = makeRow({ payload_hash: 'a' });
    const r2 = makeRow({ payload_hash: 'b' });
    expect(computeHash(r1)).not.toBe(computeHash(r2));
  });

  it('changes when previous_hash changes', () => {
    const r1 = makeRow({ previous_hash: null });
    const r2 = makeRow({ previous_hash: 'prev' });
    expect(computeHash(r1)).not.toBe(computeHash(r2));
  });
});

describe('verifyChain', () => {
  it('returns ok for a valid 2-row chain with no prior', async () => {
    const r1 = makeRow({ id: 'r1', previous_hash: null });
    r1.hash = computeHash(r1);
    const r2 = makeRow({
      id: 'r2',
      occurred_at: new Date('2026-05-18T10:01:00.000Z'),
      previous_hash: r1.hash,
    });
    r2.hash = computeHash(r2);

    const client = fakeClient([
      () => ({ rows: [r1, r2] }),
      // prior-row probe
      () => ({ rows: [] }),
    ]);

    const result = await verifyChain(
      client,
      't1',
      '2026-05-18T00:00:00.000Z',
      '2026-05-19T00:00:00.000Z',
    );
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(2);
  });

  it('detects tampering when payload_hash is changed but hash is not recomputed', async () => {
    const r1 = makeRow({ id: 'r1', previous_hash: null, payload_hash: 'p-original' });
    r1.hash = computeHash(r1);
    // Tamper: change payload_hash but leave hash field
    r1.payload_hash = 'p-tampered';

    const client = fakeClient([
      () => ({ rows: [r1] }),
      () => ({ rows: [] }),
    ]);

    const result = await verifyChain(
      client,
      't1',
      '2026-05-18T00:00:00.000Z',
      '2026-05-19T00:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    expect(result.brokenAtRowId).toBe('r1');
    expect(result.reason).toMatch(/hash mismatch/);
  });

  it('detects broken previous_hash linkage', async () => {
    const r1 = makeRow({ id: 'r1', previous_hash: null });
    r1.hash = computeHash(r1);
    const r2 = makeRow({
      id: 'r2',
      occurred_at: new Date('2026-05-18T10:01:00.000Z'),
      previous_hash: 'wrong-prev', // broken link
    });
    r2.hash = computeHash(r2);

    const client = fakeClient([
      () => ({ rows: [r1, r2] }),
      () => ({ rows: [] }),
    ]);

    const result = await verifyChain(
      client,
      't1',
      '2026-05-18T00:00:00.000Z',
      '2026-05-19T00:00:00.000Z',
    );
    expect(result.ok).toBe(false);
    expect(result.brokenAtRowId).toBe('r2');
    expect(result.reason).toMatch(/previous_hash/);
  });

  it('handles empty range', async () => {
    const client = fakeClient([
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);
    const result = await verifyChain(client, 't1', '2026-05-18T00:00:00.000Z', '2026-05-19T00:00:00.000Z');
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(0);
  });
});
