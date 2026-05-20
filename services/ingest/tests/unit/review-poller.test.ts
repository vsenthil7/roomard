/**
 * Review poller tests (UC-25).
 *
 * Coverage targets:
 *  - Confidence-banded link behaviour (auto-link / queue / unlinked)
 *  - Deduplication via ON CONFLICT DO NOTHING
 *  - Fallback when no candidates exist
 *  - Adapter dispatch (DirectFeedback uses DB; stubs return [])
 *  - "since" window resolution (uses last_polled_at if present, else 30d)
 *
 * All DB calls go through a fake PoolClient — no live Postgres needed.
 */
import type { PoolClient } from 'pg';
import { describe, it, expect, vi } from 'vitest';

import {
  DirectFeedbackAdapter,
  StubTripAdvisorAdapter,
  StubBookingAdapter,
  StubGoogleAdapter,
  pollAndLink,
  type SourceAdapter,
  type ExternalReview,
} from '../../src/review-poller.js';

interface QueryRecord {
  sql: string;
  params: unknown[];
}

function fakeClient(handlers: Array<(sql: string, params: unknown[]) => { rows: unknown[] }>): {
  client: PoolClient;
  calls: QueryRecord[];
} {
  let idx = 0;
  const calls: QueryRecord[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const h = handlers[idx];
    if (!h) {
      throw new Error(`unexpected query #${idx + 1}: ${sql.slice(0, 80)}`);
    }
    idx += 1;
    return h(sql, params);
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return { client, calls };
}

const TENANT = '00000000-0000-4000-8000-000000000001';
const PROPERTY = '00000000-0000-4000-8000-000000000010';
const REQUEST = 'req-poll-1';

// A test adapter that returns whatever reviews we want — bypasses the real
// DirectFeedback / Stub adapters so we can drive the linking logic.
class TestAdapter implements SourceAdapter {
  readonly source = 'tripadvisor' as const;
  constructor(private readonly reviews: ExternalReview[]) {}
  async fetchNew(): Promise<ExternalReview[]> {
    return this.reviews;
  }
}

describe('pollAndLink — happy path with auto-linkable review', () => {
  it('inserts the review and auto-links when confidence >= 0.85', async () => {
    const review: ExternalReview = {
      externalId: 'ta-100',
      postedAt: '2026-05-18T10:00:00Z',
      body: 'Stayed three nights, lovely room — thanks!',
      authorAlias: 'Alice S.',
    };
    const adapter = new TestAdapter([review]);

    const { client, calls } = fakeClient([
      // 1. getLastPolledAt
      () => ({ rows: [{ last_polled_at: new Date('2026-05-01') }] }),
      // 2. findIntegrationId
      () => ({ rows: [{ id: 'int-1' }] }),
      // 3. upsertReview — returns review id (new insert)
      () => ({ rows: [{ id: 'rev-1', was_insert: true }] }),
      // 4. candidates lookup
      () => ({
        rows: [
          {
            guest_id: 'g-alice',
            display_name: 'Alice Smith',
            arrival_at: new Date('2026-05-15'),
            departure_at: new Date('2026-05-18'),
          },
        ],
      }),
      // 5. UPDATE reviews to set auto_linked
      () => ({ rows: [] }),
      // 6. UPDATE integrations.last_polled_at
      () => ({ rows: [] }),
    ]);

    const aiInvoke = vi.fn(async (input: { capability: string; payload: unknown }) => {
      expect(input.capability).toBe('llm.review_link');
      const payload = input.payload as { candidates: unknown[] };
      expect(payload.candidates).toHaveLength(1);
      return {
        output: {
          linkedGuestId: 'g-alice',
          confidence: 0.91,
          reasons: ['name match', 'stay dates align'],
        },
        modelId: 'ernie-4.5-mock',
      };
    });

    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );

    expect(summary.fetched).toBe(1);
    expect(summary.newReviews).toBe(1);
    expect(summary.linked).toBe(1);
    expect(summary.exceptionQueued).toBe(0);
    expect(summary.unlinked).toBe(0);
    expect(summary.errors).toEqual([]);

    // CRITICAL: must have used auto_linked enum, not 'linked'.
    const linkUpdate = calls[4]!.sql;
    expect(linkUpdate).toContain("'auto_linked'");
    expect(linkUpdate).toContain('linked_at');
    expect(calls[4]!.params).toEqual(['g-alice', 0.91, 'rev-1']);
  });
});

describe('pollAndLink — medium-confidence review goes to exception queue', () => {
  it('queues to exception when 0.5 <= confidence < 0.85', async () => {
    const adapter = new TestAdapter([
      {
        externalId: 'ta-200',
        postedAt: '2026-05-18T10:00:00Z',
        body: 'Decent stay.',
      },
    ]);

    const { client, calls } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
      () => ({ rows: [{ id: 'int-1' }] }),
      () => ({ rows: [{ id: 'rev-2', was_insert: true }] }),
      () => ({
        rows: [
          {
            guest_id: 'g-x',
            display_name: 'X',
            arrival_at: new Date(),
            departure_at: new Date(),
          },
        ],
      }),
      // UPDATE reviews link_confidence + status=unlinked
      () => ({ rows: [] }),
      // INSERT exception_queue_items
      () => ({ rows: [] }),
      // UPDATE last_polled_at
      () => ({ rows: [] }),
    ]);

    const aiInvoke = vi.fn(async () => ({
      output: { linkedGuestId: 'g-x', confidence: 0.65, reasons: ['weak name match'] },
      modelId: 'ernie-4.5-mock',
    }));

    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );

    expect(summary.linked).toBe(0);
    expect(summary.exceptionQueued).toBe(1);

    // Exception kind must match the schema enum.
    const insertExc = calls[5]!.sql;
    expect(insertExc).toContain("'review_link_ambiguous'");
    expect(insertExc).toContain("'open'");
  });
});

describe('pollAndLink — low confidence leaves unlinked, no exception', () => {
  it('does NOT create exception when confidence < 0.5', async () => {
    const adapter = new TestAdapter([
      {
        externalId: 'ta-300',
        postedAt: '2026-05-18T10:00:00Z',
        body: 'Fine.',
      },
    ]);

    const { client, calls } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
      () => ({ rows: [{ id: 'int-1' }] }),
      () => ({ rows: [{ id: 'rev-3', was_insert: true }] }),
      () => ({
        rows: [
          {
            guest_id: 'g-y',
            display_name: 'Y',
            arrival_at: new Date(),
            departure_at: new Date(),
          },
        ],
      }),
      // UPDATE reviews — just status='unlinked' + confidence
      () => ({ rows: [] }),
      // UPDATE last_polled_at
      () => ({ rows: [] }),
    ]);

    const aiInvoke = vi.fn(async () => ({
      output: { linkedGuestId: null, confidence: 0.2, reasons: [] },
      modelId: 'ernie-4.5-mock',
    }));

    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );

    expect(summary.unlinked).toBe(1);
    expect(summary.exceptionQueued).toBe(0);
    expect(summary.linked).toBe(0);
    // 6 queries total: getLastPolled + findIntegration + upsert + candidates + UPDATE + UPDATE.
    // No INSERT into exception_queue_items.
    expect(calls).toHaveLength(6);
  });
});

describe('pollAndLink — deduplication via ON CONFLICT', () => {
  it('counts duplicate reviews and skips linking for them', async () => {
    const adapter = new TestAdapter([
      {
        externalId: 'ta-dup',
        postedAt: '2026-05-18T10:00:00Z',
        body: 'Already seen.',
      },
    ]);

    const { client } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
      () => ({ rows: [{ id: 'int-1' }] }),
      // ON CONFLICT DO NOTHING → 0 rows
      () => ({ rows: [] }),
      // UPDATE last_polled_at
      () => ({ rows: [] }),
    ]);

    const aiInvoke = vi.fn();

    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );

    expect(summary.duplicates).toBe(1);
    expect(summary.newReviews).toBe(0);
    // CRITICAL: no AI call for already-seen reviews.
    expect(aiInvoke).not.toHaveBeenCalled();
  });
});

describe('pollAndLink — no candidates means unlinked, no AI call', () => {
  it('does not call AI when there are no candidate guests', async () => {
    const adapter = new TestAdapter([
      {
        externalId: 'ta-orphan',
        postedAt: '2026-05-18T10:00:00Z',
        body: 'Mystery reviewer.',
      },
    ]);

    const { client } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
      () => ({ rows: [{ id: 'int-1' }] }),
      () => ({ rows: [{ id: 'rev-4', was_insert: true }] }),
      // candidates: empty
      () => ({ rows: [] }),
      // UPDATE reviews → unlinked
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);

    const aiInvoke = vi.fn();

    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );

    expect(summary.unlinked).toBe(1);
    expect(aiInvoke).not.toHaveBeenCalled();
  });
});

describe('pollAndLink — no integration row means error, no fetch', () => {
  it('records error when no active integration row exists', async () => {
    const adapter = new TestAdapter([
      {
        externalId: 'ta-x',
        postedAt: '2026-05-18T10:00:00Z',
        body: 'x',
      },
    ]);

    const { client } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
      // findIntegrationId: none
      () => ({ rows: [] }),
    ]);

    const aiInvoke = vi.fn();

    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('no active integration row');
    expect(aiInvoke).not.toHaveBeenCalled();
  });
});

describe('pollAndLink — adapter failure recorded in summary, does not throw', () => {
  it('catches adapter.fetchNew rejection', async () => {
    class FailingAdapter implements SourceAdapter {
      readonly source = 'tripadvisor' as const;
      async fetchNew(): Promise<ExternalReview[]> {
        throw new Error('API rate-limited');
      }
    }
    const { client } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
    ]);
    const aiInvoke = vi.fn();
    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter: new FailingAdapter() },
    );
    expect(summary.errors[0]).toContain('fetch failed');
    expect(summary.fetched).toBe(0);
  });
});

describe('Stub adapters', () => {
  it('TripAdvisor stub returns empty array', async () => {
    expect(await new StubTripAdvisorAdapter().fetchNew()).toEqual([]);
  });
  it('Booking stub returns empty array', async () => {
    expect(await new StubBookingAdapter().fetchNew()).toEqual([]);
  });
  it('Google stub returns empty array', async () => {
    expect(await new StubGoogleAdapter().fetchNew()).toEqual([]);
  });
});

describe('DirectFeedbackAdapter', () => {
  it('queries direct_feedback_intake and normalises into ExternalReview', async () => {
    const queryMock = vi.fn(async () => ({
      rows: [
        {
          id: 'df-1',
          submitted_at: new Date('2026-05-18T12:00:00Z'),
          rating: 4.5,
          body: 'Lovely stay',
          author_name: 'Jane',
        },
      ],
    }));
    const adapter = new DirectFeedbackAdapter({
      query: queryMock as unknown as PoolClient['query'],
    });
    const reviews = await adapter.fetchNew({ propertyId: PROPERTY, since: '2026-05-01' });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toEqual({
      externalId: 'df-1',
      postedAt: '2026-05-18T12:00:00.000Z',
      rating: 4.5,
      body: 'Lovely stay',
      authorAlias: 'Jane',
    });
    expect(adapter.source).toBe('manual');
  });

  it('passes the since cutoff into the SQL query', async () => {
    const queryMock = vi.fn(async () => ({ rows: [] }));
    const adapter = new DirectFeedbackAdapter({
      query: queryMock as unknown as PoolClient['query'],
    });
    await adapter.fetchNew({ propertyId: PROPERTY, since: '2026-05-01T00:00:00Z' });
    expect(queryMock).toHaveBeenCalledOnce();
    const params = queryMock.mock.calls[0]?.[1] as unknown[];
    expect(params[1]).toBe('2026-05-01T00:00:00Z');
  });
});

describe('parseLinkResult — robustness against AI output shapes', () => {
  it('handles rawText with embedded JSON', async () => {
    // Drive this through the public path: an AI invoke returning rawText.
    const adapter = new TestAdapter([
      {
        externalId: 'rt-1',
        postedAt: '2026-05-18T10:00:00Z',
        body: 'x',
      },
    ]);
    const { client } = fakeClient([
      () => ({ rows: [{ last_polled_at: null }] }),
      () => ({ rows: [{ id: 'int-1' }] }),
      () => ({ rows: [{ id: 'rev-rt', was_insert: true }] }),
      () => ({
        rows: [
          { guest_id: 'g-z', display_name: 'Z', arrival_at: new Date(), departure_at: new Date() },
        ],
      }),
      // High-confidence path: UPDATE reviews to auto_linked
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);
    const aiInvoke = vi.fn(async () => ({
      output: {
        rawText: JSON.stringify({ linkedGuestId: 'g-z', confidence: 0.95, reasons: ['exact match'] }),
      },
      modelId: 'm',
    }));
    const summary = await pollAndLink(
      client,
      { aiInvoke },
      { tenantId: TENANT, propertyId: PROPERTY, requestId: REQUEST, adapter },
    );
    expect(summary.linked).toBe(1);
  });
});
