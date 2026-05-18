import { describe, it, expect, beforeEach } from 'vitest';
import { MockAiProvider } from '../src/mock-provider.js';
import { hashPayload } from '../src/types.js';

describe('MockAiProvider', () => {
  let provider: MockAiProvider;
  beforeEach(() => {
    provider = new MockAiProvider();
  });

  it('handles ocr.card', async () => {
    const result = await provider.invoke({
      capability: 'ocr.card',
      tenantId: '00000000-0000-4000-8000-000000000001',
      requestId: 'req-1',
      payload: { imageBase64: 'aaaa' },
    });
    expect(result.modelId).toContain('paddleocr');
    expect(result.output).toHaveProperty('fields');
    expect((result.output as { fields: unknown[] }).fields.length).toBeGreaterThan(0);
  });

  it('handles llm.brief with VIP detection by loyalty tier', async () => {
    const result = await provider.invoke({
      capability: 'llm.brief',
      tenantId: '00000000-0000-4000-8000-000000000001',
      requestId: 'req-2',
      payload: {
        arrivals: [
          {
            guestId: '00000000-0000-4000-8000-000000000a01',
            displayName: 'Jane VIP',
            preferences: ['Earl Grey tea'],
            recentIssues: [],
            loyaltyTier: 'platinum',
          },
        ],
      },
    });
    const items = (result.output as { items: Array<{ priority: string }> }).items;
    expect(items[0]!.priority).toBe('vip');
  });

  it('handles llm.review_link with name match', async () => {
    const result = await provider.invoke({
      capability: 'llm.review_link',
      tenantId: '00000000-0000-4000-8000-000000000001',
      requestId: 'req-3',
      payload: {
        reviewBody: 'Loved my stay. Jane was wonderful at the front desk.',
        candidates: [
          {
            guestId: '00000000-0000-4000-8000-000000000a01',
            displayName: 'Jane',
            stayDates: '2026-05-10',
          },
        ],
      },
    });
    const out = result.output as { linkedGuestId: string | null; confidence: number };
    expect(out.linkedGuestId).toBe('00000000-0000-4000-8000-000000000a01');
    expect(out.confidence).toBeGreaterThan(0.8);
  });

  it('returns null linkage when no candidates', async () => {
    const result = await provider.invoke({
      capability: 'llm.review_link',
      tenantId: '00000000-0000-4000-8000-000000000001',
      requestId: 'req-4',
      payload: { reviewBody: 'Great', candidates: [] },
    });
    expect((result.output as { linkedGuestId: string | null }).linkedGuestId).toBeNull();
  });

  it('honours forced failure', async () => {
    provider.forceFailure('ocr.card');
    await expect(
      provider.invoke({
        capability: 'ocr.card',
        tenantId: '00000000-0000-4000-8000-000000000001',
        requestId: 'req-5',
        payload: { imageBase64: 'aaaa' },
      }),
    ).rejects.toThrow();
  });

  it('clearFailures restores normal behaviour', async () => {
    provider.forceFailure('llm.brief');
    provider.clearFailures();
    await expect(
      provider.invoke({
        capability: 'llm.brief',
        tenantId: '00000000-0000-4000-8000-000000000001',
        requestId: 'req-6',
        payload: { arrivals: [] },
      }),
    ).resolves.toBeDefined();
  });

  it('handles llm.reasoning', async () => {
    const result = await provider.invoke({
      capability: 'llm.reasoning',
      tenantId: '00000000-0000-4000-8000-000000000001',
      requestId: 'req-7',
      payload: { prompt: 'Plan housekeeping for tomorrow' },
    });
    expect(result.modelId).toContain('ernie-x1');
    expect(result.output).toHaveProperty('answer');
  });
});

describe('hashPayload', () => {
  it('is stable for the same content', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ a: 1, b: 2 }));
  });

  it('is order-stable for object keys', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
  });

  it('differs for different content', () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});
