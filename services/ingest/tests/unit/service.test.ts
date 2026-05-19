import { createHmac } from 'node:crypto';

import { describe, it, expect, vi } from 'vitest';

import { verifyMewsSignature, ingestMewsReservation } from '../../src/server.js';

describe('verifyMewsSignature', () => {
  const secret = 'webhook-secret-1234567890';
  const body = Buffer.from('{"reservationId":"r-1"}', 'utf8');
  const sig = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a correct signature', () => {
    expect(verifyMewsSignature(body, sig, secret)).toBe(true);
  });

  it('accepts a correct signature with sha256= prefix', () => {
    expect(verifyMewsSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from('{"reservationId":"r-2"}', 'utf8');
    expect(verifyMewsSignature(tampered, sig, secret)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyMewsSignature(body, sig, 'other-secret')).toBe(false);
  });

  it('rejects a malformed signature', () => {
    expect(verifyMewsSignature(body, 'not-hex', secret)).toBe(false);
  });
});

describe('ingestMewsReservation', () => {
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

  const baseInput = {
    reservationId: 'mews-r-1',
    guestId: 'mews-g-1',
    guestDisplayName: 'Jane Smith',
    guestEmail: 'jane@example.com',
    propertyId: '00000000-0000-4000-8000-000000000010',
    arrivalAt: '2026-05-18T15:00:00.000Z',
    departureAt: '2026-05-20T11:00:00.000Z',
    roomNumber: '101',
    status: 'booked' as const,
  };

  it('creates a new guest and stay', async () => {
    const client = fakeClient([
      // property check
      () => ({ rows: [{ id: 'p1' }] }),
      // guest lookup by mews id
      () => ({ rows: [] }),
      // guest insert
      () => ({ rows: [{ id: 'g-new' }] }),
      // stay upsert
      () => ({ rows: [{ id: 's-new', was_inserted: true }] }),
    ]);
    const out = await ingestMewsReservation(client, 't1', baseInput);
    expect(out.status).toBe('created');
    expect(out.guestId).toBe('g-new');
    expect(out.stayId).toBe('s-new');
  });

  it('updates existing guest when mews_id already known', async () => {
    const client = fakeClient([
      () => ({ rows: [{ id: 'p1' }] }),
      () => ({ rows: [{ id: 'g-existing' }] }),
      () => ({ rows: [] }), // guest update
      () => ({ rows: [{ id: 's1', was_inserted: false }] }),
    ]);
    const out = await ingestMewsReservation(client, 't1', baseInput);
    expect(out.guestId).toBe('g-existing');
    expect(out.status).toBe('updated');
  });

  it('throws NotFoundError when property is missing', async () => {
    const client = fakeClient([() => ({ rows: [] })]);
    await expect(ingestMewsReservation(client, 't1', baseInput)).rejects.toThrow(/property not found/i);
  });
});
