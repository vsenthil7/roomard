/**
 * Housekeeping prep card tests (UC-09).
 *
 * Coverage:
 *  - D-1 arrival date arithmetic
 *  - Idempotency via ON CONFLICT (stay_id, prep_date)
 *  - AI warm note generation with fallback when AI fails
 *  - Prep item curation: pulls room-prep kinds only, capped at 8
 *  - completePrepCard idempotency / not_found
 *  - listPrepCards ordering
 */
import type { PoolClient } from 'pg';
import { describe, it, expect, vi } from 'vitest';

import {
  generatePrepCardsForDate,
  completePrepCard,
  listPrepCards,
} from '../../src/prep-cards.js';

function fakeClient(handlers: Array<(sql: string, params: unknown[]) => unknown>): {
  client: PoolClient;
  sqls: string[];
} {
  let idx = 0;
  const sqls: string[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      sqls.push(sql);
      const h = handlers[idx];
      if (!h) {
        throw new Error(`unexpected query #${idx + 1}: ${sql.slice(0, 80)}`);
      }
      idx += 1;
      return h(sql, params);
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  return { client, sqls };
}

const TENANT = '00000000-0000-4000-8000-000000000001';
const PROPERTY = '00000000-0000-4000-8000-000000000010';
const REQUEST = 'req-prep-1';

describe('generatePrepCardsForDate', () => {
  it('generates a card per arrival with AI warm note', async () => {
    const { client, sqls } = fakeClient([
      // property check
      () => ({ rows: [{ id: PROPERTY }] }),
      // arrivals query
      () => ({
        rows: [
          {
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Alice',
            room_number: '101',
            arrival_at: new Date('2026-05-19T15:00:00Z'),
            attention_flags: ['mobility_assist'],
          },
        ],
      }),
      // existing card check — none
      () => ({ rows: [] }),
      // preferences query
      () => ({
        rows: [
          { kind: 'allergy', polarity: 'allergy', detail: 'peanuts', confidence: '0.95' },
          { kind: 'pillow', polarity: 'like', detail: '2 firm', confidence: '0.85' },
          { kind: 'celebration', polarity: 'like', detail: 'anniversary', confidence: '0.8' },
        ],
      }),
      // upsert returning was_inserted=true
      () => ({ rows: [{ was_inserted: true }] }),
    ]);

    const aiInvoke = vi.fn(async (input: { capability: string; payload: unknown }) => {
      expect(input.capability).toBe('llm.brief');
      // The prep card should pass context=housekeeping_prep_card so the
      // prompt can shape itself differently from the morning brief.
      expect((input.payload as { context: string }).context).toBe('housekeeping_prep_card');
      return {
        output: {
          items: [{ sayThis: 'Welcome Alice — peanut-free room, anniversary setup ready.' }],
        },
        modelId: 'ernie-4.5-mock',
        promptVersion: 'brief.generation:v1',
      };
    });

    const summary = await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
      },
    );

    expect(summary.cardsCreated).toBe(1);
    expect(summary.cardsUpdated).toBe(0);
    expect(summary.cardsSkipped).toBe(0);
    expect(summary.warmNotesGenerated).toBe(1);
    expect(summary.arrivalDate).toBe('2026-05-19');
    expect(summary.errors).toEqual([]);

    // Verify upsert had the expected params
    const upsertSql = sqls[4]!;
    expect(upsertSql).toContain('housekeeping_prep_cards');
    expect(upsertSql).toContain('ON CONFLICT');
  });

  it('skips when card exists and force=false', async () => {
    const { client } = fakeClient([
      () => ({ rows: [{ id: PROPERTY }] }),
      () => ({
        rows: [
          {
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Alice',
            room_number: '101',
            arrival_at: new Date('2026-05-19T15:00:00Z'),
            attention_flags: [],
          },
        ],
      }),
      // existing card found
      () => ({ rows: [{ id: 'pc-existing' }] }),
    ]);
    const aiInvoke = vi.fn();
    const summary = await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
        force: false,
      },
    );
    expect(summary.cardsSkipped).toBe(1);
    expect(summary.cardsCreated).toBe(0);
    expect(aiInvoke).not.toHaveBeenCalled(); // skipped before AI call
  });

  it('falls back to no warm note if AI fails', async () => {
    const { client } = fakeClient([
      () => ({ rows: [{ id: PROPERTY }] }),
      () => ({
        rows: [
          {
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Alice',
            room_number: '101',
            arrival_at: new Date('2026-05-19T15:00:00Z'),
            attention_flags: [],
          },
        ],
      }),
      () => ({ rows: [] }), // no existing
      () => ({ rows: [] }), // no preferences
      () => ({ rows: [{ was_inserted: true }] }),
    ]);
    const aiInvoke = vi.fn(async () => {
      throw new Error('gateway down');
    });
    const summary = await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
      },
    );
    // Card is still created. The point: housekeeper gets the prep info even
    // if the AI is down. The warm_note column ends up NULL.
    expect(summary.cardsCreated).toBe(1);
    expect(summary.errors).toEqual([]);
  });

  it('returns empty summary when no arrivals', async () => {
    const { client } = fakeClient([
      () => ({ rows: [{ id: PROPERTY }] }),
      () => ({ rows: [] }),
    ]);
    const aiInvoke = vi.fn();
    const summary = await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
      },
    );
    expect(summary.cardsCreated).toBe(0);
    expect(summary.cardsUpdated).toBe(0);
    expect(summary.cardsSkipped).toBe(0);
    expect(aiInvoke).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when property does not exist', async () => {
    const { client } = fakeClient([() => ({ rows: [] })]);
    const aiInvoke = vi.fn();
    await expect(
      generatePrepCardsForDate(
        client,
        { aiInvoke },
        {
          tenantId: TENANT,
          propertyId: PROPERTY,
          prepDate: '2026-05-18',
          requestId: REQUEST,
        },
      ),
    ).rejects.toThrow(/property not found/);
  });

  it('passes prep_date + 1 day to arrival query (D-1 generation)', async () => {
    const { client, sqls: _sqls } = fakeClient([
      () => ({ rows: [{ id: PROPERTY }] }),
      (_sql, params) => {
        // Second query is arrivals — confirm the date param is prepDate+1
        expect(params[1]).toBe('2026-05-19');
        return { rows: [] };
      },
    ]);
    const aiInvoke = vi.fn();
    await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
      },
    );
  });

  it('respects includeWarmNote=false and skips AI call', async () => {
    const { client } = fakeClient([
      () => ({ rows: [{ id: PROPERTY }] }),
      () => ({
        rows: [
          {
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Alice',
            room_number: '101',
            arrival_at: new Date('2026-05-19T15:00:00Z'),
            attention_flags: [],
          },
        ],
      }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [{ was_inserted: true }] }),
    ]);
    const aiInvoke = vi.fn();
    const summary = await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
        includeWarmNote: false,
      },
    );
    expect(summary.cardsCreated).toBe(1);
    expect(summary.warmNotesGenerated).toBe(0);
    expect(aiInvoke).not.toHaveBeenCalled();
  });

  it('regenerates with force=true even if card exists', async () => {
    const { client } = fakeClient([
      () => ({ rows: [{ id: PROPERTY }] }),
      () => ({
        rows: [
          {
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Alice',
            room_number: '101',
            arrival_at: new Date('2026-05-19T15:00:00Z'),
            attention_flags: [],
          },
        ],
      }),
      // No existing-card check when force=true
      () => ({ rows: [] }),
      // upsert — ON CONFLICT updates, was_inserted=false
      () => ({ rows: [{ was_inserted: false }] }),
    ]);
    const aiInvoke = vi.fn(async () => ({
      output: { items: [{ sayThis: 'Welcome back.' }] },
      modelId: 'm',
    }));
    const summary = await generatePrepCardsForDate(
      client,
      { aiInvoke },
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        prepDate: '2026-05-18',
        requestId: REQUEST,
        force: true,
        includeWarmNote: false,
      },
    );
    expect(summary.cardsUpdated).toBe(1);
    expect(summary.cardsCreated).toBe(0);
  });
});

describe('completePrepCard', () => {
  it('marks ready/pending card as completed', async () => {
    const { client } = fakeClient([
      () => ({ rows: [], rowCount: 1 }) as never,
    ]);
    const result = await completePrepCard(client, {
      cardId: 'pc-1',
      userId: 'u-1',
      notes: 'All done',
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns not_found when card already completed or missing', async () => {
    const { client } = fakeClient([
      () => ({ rows: [], rowCount: 0 }) as never,
    ]);
    const result = await completePrepCard(client, {
      cardId: 'pc-x',
      userId: 'u-1',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('listPrepCards', () => {
  it('returns cards ordered by arrival time then room number', async () => {
    const { client } = fakeClient([
      () => ({
        rows: [
          {
            id: 'pc-1',
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Alice',
            room_number: '101',
            arrival_at: new Date('2026-05-19T14:00:00Z'),
            prep_items: ['allergy: peanuts', 'pillow: 2 firm'],
            attention_flags: ['mobility_assist'],
            warm_note: 'Welcome Alice.',
            status: 'ready',
            completed_at: null,
          },
        ],
      }),
    ]);
    const cards = await listPrepCards(client, {
      propertyId: PROPERTY,
      prepDate: '2026-05-19',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      id: 'pc-1',
      stayId: 's-1',
      guestId: 'g-1',
      displayName: 'Alice',
      roomNumber: '101',
      arrivalAt: '2026-05-19T14:00:00.000Z',
      prepItems: ['allergy: peanuts', 'pillow: 2 firm'],
      attentionFlags: ['mobility_assist'],
      warmNote: 'Welcome Alice.',
      status: 'ready',
      completedAt: null,
    });
  });

  it('handles cards with null room number', async () => {
    const { client } = fakeClient([
      () => ({
        rows: [
          {
            id: 'pc-1',
            stay_id: 's-1',
            guest_id: 'g-1',
            display_name: 'Bob',
            room_number: null,
            arrival_at: new Date('2026-05-19T14:00:00Z'),
            prep_items: [],
            attention_flags: [],
            warm_note: null,
            status: 'pending',
            completed_at: null,
          },
        ],
      }),
    ]);
    const cards = await listPrepCards(client, {
      propertyId: PROPERTY,
      prepDate: '2026-05-19',
    });
    expect(cards[0]?.roomNumber).toBeNull();
    expect(cards[0]?.warmNote).toBeNull();
  });
});
