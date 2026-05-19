import { describe, it, expect, vi } from 'vitest';

import { generateBrief } from '../../src/pipeline.js';

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
  tenantId: '00000000-0000-4000-8000-000000000001',
  propertyId: '00000000-0000-4000-8000-000000000010',
  briefDate: '2026-05-18',
  requestId: 'req-1',
  force: false,
};

describe('generateBrief', () => {
  it('generates a brief with arrivals and items', async () => {
    const aiInvoke = vi.fn(async () => ({
      output: {
        items: [
          { guestId: 'g1', priority: 'vip', sayThis: 'Welcome back Alice', callouts: ['Earl Grey'] },
          { guestId: 'g2', priority: 'standard', sayThis: 'Welcome Bob', callouts: [] },
        ],
      },
      modelId: 'ernie-4.5-mock',
      latencyMs: 350,
      promptVersion: 'v1',
    }));

    const client = fakeClient([
      // property check
      () => ({ rows: [{ id: 'p1', timezone: 'UTC' }] }),
      // existing brief check
      () => ({ rows: [] }),
      // upsert brief generating
      () => ({ rows: [{ id: 'b1' }] }),
      // stays
      () => ({
        rows: [
          { stay_id: 's1', guest_id: 'g1', arrival_at: new Date('2026-05-18T15:00:00Z'), room_number: '101' },
          { stay_id: 's2', guest_id: 'g2', arrival_at: new Date('2026-05-18T16:00:00Z'), room_number: '102' },
        ],
      }),
      // guests
      () => ({
        rows: [
          { id: 'g1', display_name: 'Alice', loyalty_tiers: { roomard: 'platinum' } },
          { id: 'g2', display_name: 'Bob', loyalty_tiers: null },
        ],
      }),
      // preferences (ranked)
      () => ({
        rows: [
          { guest_id: 'g1', detail: 'Earl Grey', polarity: 'like' },
        ],
      }),
      // recent issues
      () => ({ rows: [] }),
      // delete prior brief_items
      () => ({ rows: [] }),
      // insert brief_item 1 (vip)
      () => ({ rows: [] }),
      // insert brief_item 2 (standard)
      () => ({ rows: [] }),
      // update brief ready
      () => ({ rows: [] }),
    ]);

    const result = await generateBrief(client, { aiInvoke }, baseInput);
    expect(result.status).toBe('ready');
    expect(result.totalArrivals).toBe(2);
    expect(result.vipCount).toBe(1);
    expect(result.attentionCount).toBe(0);
    expect(result.modelId).toBe('ernie-4.5-mock');
  });

  it('returns no_arrivals when stays list is empty', async () => {
    const aiInvoke = vi.fn();
    const client = fakeClient([
      // property
      () => ({ rows: [{ id: 'p1', timezone: 'UTC' }] }),
      // existing
      () => ({ rows: [] }),
      // upsert brief generating
      () => ({ rows: [{ id: 'b1' }] }),
      // stays empty
      () => ({ rows: [] }),
      // update brief ready/no_arrivals
      () => ({ rows: [] }),
    ]);
    const result = await generateBrief(client, { aiInvoke: aiInvoke as never }, baseInput);
    expect(result.status).toBe('no_arrivals');
    expect(aiInvoke).not.toHaveBeenCalled();
  });

  it('returns existing brief when one already exists and force is false', async () => {
    const aiInvoke = vi.fn();
    const client = fakeClient([
      // property
      () => ({ rows: [{ id: 'p1', timezone: 'UTC' }] }),
      // existing
      () => ({ rows: [{ id: 'b1', status: 'ready' }] }),
      // loadExistingStats
      () => ({ rows: [{ total_arrivals: 5, vip_count: 1, attention_count: 1 }] }),
    ]);
    const result = await generateBrief(client, { aiInvoke: aiInvoke as never }, baseInput);
    expect(result.status).toBe('existing');
    expect(result.briefId).toBe('b1');
    expect(result.totalArrivals).toBe(5);
    expect(aiInvoke).not.toHaveBeenCalled();
  });

  it('throws ConflictError when prior generation in progress', async () => {
    const aiInvoke = vi.fn();
    const client = fakeClient([
      () => ({ rows: [{ id: 'p1', timezone: 'UTC' }] }),
      () => ({ rows: [{ id: 'b1', status: 'generating' }] }),
    ]);
    await expect(
      generateBrief(client, { aiInvoke: aiInvoke as never }, baseInput),
    ).rejects.toThrow(/already in progress/i);
  });

  it('throws NotFoundError when property is missing', async () => {
    const aiInvoke = vi.fn();
    const client = fakeClient([() => ({ rows: [] })]);
    await expect(
      generateBrief(client, { aiInvoke: aiInvoke as never }, baseInput),
    ).rejects.toThrow(/property not found/i);
  });
});
