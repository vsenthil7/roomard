import { describe, it, expect, vi } from 'vitest';
import { processCardCapture } from '../src/pipeline.js';
import { InMemoryObjectStore } from '../src/object-store.js';

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

const baseMeta = {
  propertyId: '00000000-0000-4000-8000-000000000010',
  guestId: '00000000-0000-4000-8000-000000000a01',
  metadata: { capturedAt: '2026-05-18T10:00:00.000Z', captureSurface: 'mobile_camera' as const },
};

describe('processCardCapture', () => {
  it('accepts high-confidence OCR and creates preferences', async () => {
    const objectStore = new InMemoryObjectStore();
    const aiInvoke = vi.fn(async () => ({
      output: {
        rawText: 'Likes Earl Grey, two firm pillows',
        fields: [
          { name: 'preference.beverage.tea', value: 'Earl Grey', confidence: 0.92 },
          { name: 'preference.room.pillow', value: 'Two firm pillows', confidence: 0.88 },
        ],
        language: 'en',
      },
      modelId: 'paddleocr-vl-mock',
      latencyMs: 100,
    }));

    const client = fakeClient([
      // property check
      () => ({ rows: [{ id: 'p1' }] }),
      // guest check
      () => ({ rows: [{ id: 'g1' }] }),
      // insert evidence
      () => ({ rows: [{ id: 'ev1' }] }),
      // update evidence raw_text+conf
      () => ({ rows: [] }),
      // pref 1: upsert
      () => ({ rows: [{ id: 'pr1' }] }),
      // pref 1: link
      () => ({ rows: [] }),
      // pref 2: upsert
      () => ({ rows: [{ id: 'pr2' }] }),
      // pref 2: link
      () => ({ rows: [] }),
      // mark evidence accepted
      () => ({ rows: [] }),
      // card_captures upsert
      () => ({ rows: [] }),
    ]);

    const out = await processCardCapture(
      client,
      { objectStore, aiInvoke },
      {
        meta: baseMeta,
        fileBuffer: Buffer.from('fake-image-bytes'),
        contentType: 'image/jpeg',
        tenantId: '00000000-0000-4000-8000-000000000001',
        requestId: 'req-1',
        userId: 'u1',
      },
    );

    expect(out.status).toBe('accepted');
    expect(out.evidenceId).toBe('ev1');
    expect(out.extractedPreferences).toHaveLength(2);
    expect(out.extractedPreferences[0]!.preferenceId).toBe('pr1');
    expect(objectStore.size()).toBe(1);
    expect(aiInvoke).toHaveBeenCalledOnce();
  });

  it('routes low-confidence OCR to exception queue', async () => {
    const objectStore = new InMemoryObjectStore();
    const aiInvoke = vi.fn(async () => ({
      output: {
        rawText: 'illegible',
        fields: [{ name: 'preference.unknown', value: '???', confidence: 0.42 }],
        language: 'en',
      },
      modelId: 'paddleocr-vl-mock',
      latencyMs: 100,
    }));

    const client = fakeClient([
      // property
      () => ({ rows: [{ id: 'p1' }] }),
      // guest
      () => ({ rows: [{ id: 'g1' }] }),
      // evidence insert
      () => ({ rows: [{ id: 'ev1' }] }),
      // evidence update conf
      () => ({ rows: [] }),
      // evidence status pending_review
      () => ({ rows: [] }),
      // exception_queue insert
      () => ({ rows: [{ id: 'exq1' }] }),
    ]);

    const out = await processCardCapture(
      client,
      { objectStore, aiInvoke },
      {
        meta: baseMeta,
        fileBuffer: Buffer.from('blurry'),
        contentType: 'image/jpeg',
        tenantId: '00000000-0000-4000-8000-000000000001',
        requestId: 'req-2',
        userId: 'u1',
      },
    );

    expect(out.status).toBe('pending_review');
    expect(out.exceptionQueueItemId).toBe('exq1');
    expect(out.extractedPreferences[0]!.preferenceId).toBeUndefined();
  });

  it('throws NotFoundError when property does not exist', async () => {
    const objectStore = new InMemoryObjectStore();
    const aiInvoke = vi.fn();
    const client = fakeClient([() => ({ rows: [] })]);
    await expect(
      processCardCapture(
        client,
        { objectStore, aiInvoke: aiInvoke as never },
        {
          meta: baseMeta,
          fileBuffer: Buffer.from('x'),
          contentType: 'image/jpeg',
          tenantId: '00000000-0000-4000-8000-000000000001',
          requestId: 'req-3',
          userId: 'u1',
        },
      ),
    ).rejects.toThrow(/property not found/i);
    expect(aiInvoke).not.toHaveBeenCalled();
  });

  it('handles capture without guestId (no preference upsert)', async () => {
    const objectStore = new InMemoryObjectStore();
    const aiInvoke = vi.fn(async () => ({
      output: {
        rawText: 'Tea preference noted',
        fields: [{ name: 'preference.beverage.tea', value: 'Earl Grey', confidence: 0.9 }],
      },
      modelId: 'paddleocr-vl-mock',
      latencyMs: 50,
    }));

    const client = fakeClient([
      // property
      () => ({ rows: [{ id: 'p1' }] }),
      // evidence insert
      () => ({ rows: [{ id: 'ev2' }] }),
      // evidence update conf
      () => ({ rows: [] }),
      // mark evidence accepted
      () => ({ rows: [] }),
      // card_captures upsert
      () => ({ rows: [] }),
    ]);

    const { guestId, ...metaNoGuest } = baseMeta;
    void guestId;
    const out = await processCardCapture(
      client,
      { objectStore, aiInvoke },
      {
        meta: metaNoGuest,
        fileBuffer: Buffer.from('image'),
        contentType: 'image/jpeg',
        tenantId: '00000000-0000-4000-8000-000000000001',
        requestId: 'req-4',
        userId: 'u1',
      },
    );

    expect(out.status).toBe('accepted');
    expect(out.extractedPreferences).toHaveLength(0);
  });
});
