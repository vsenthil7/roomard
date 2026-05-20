/**
 * PromptStore tests — cache behaviour, fallback semantics, substitution.
 *
 * We don't need a live Postgres here: PromptStore takes a RoomardPool whose
 * `query` method we stub. That's the same pattern guest-svc and brief-svc use.
 */
import type { RoomardPool } from '@roomard/db';
import { describe, it, expect, vi } from 'vitest';

import { PromptStore, substitute } from '../../src/prompt-store.js';

interface FakePoolOpts {
  rows?: unknown[];
  shouldFail?: boolean;
}

function fakePool(opts: FakePoolOpts = {}): {
  pool: RoomardPool;
  queryMock: ReturnType<typeof vi.fn>;
} {
  const queryMock = vi.fn(async () => {
    if (opts.shouldFail) throw new Error('DB unreachable');
    return { rows: opts.rows ?? [] };
  });
  const pool = { query: queryMock } as unknown as RoomardPool;
  return { pool, queryMock };
}

const sampleRow = {
  id: '00000000-0000-4000-8000-000000000001',
  template_id: '00000000-0000-4000-8000-000000000002',
  template_name: 'brief.generation',
  version_label: 'v2',
  model_id: 'ernie-4.5-8k',
  system_prompt: 'You are Roomard.',
  user_prompt: 'Generate brief for {{briefDate}} with {{count}} arrivals.',
  parameters: { temperature: 0.3, response_format: { type: 'json_object' } },
};

describe('PromptStore', () => {
  it('returns null when no active version exists for a template', async () => {
    const { pool, queryMock } = fakePool({ rows: [] });
    const store = new PromptStore(pool);
    const result = await store.getActive('brief.generation');
    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it('maps the row to a PromptVersion object', async () => {
    const { pool } = fakePool({ rows: [sampleRow] });
    const store = new PromptStore(pool);
    const result = await store.getActive('brief.generation');
    expect(result).toEqual({
      id: sampleRow.id,
      templateId: sampleRow.template_id,
      templateName: sampleRow.template_name,
      versionLabel: 'v2',
      modelId: 'ernie-4.5-8k',
      systemPrompt: 'You are Roomard.',
      userPrompt: 'Generate brief for {{briefDate}} with {{count}} arrivals.',
      parameters: { temperature: 0.3, response_format: { type: 'json_object' } },
    });
  });

  it('caches results within the TTL window — second call hits cache, not DB', async () => {
    const { pool, queryMock } = fakePool({ rows: [sampleRow] });
    const store = new PromptStore(pool, { cacheTtlMs: 60_000 });
    await store.getActive('brief.generation');
    await store.getActive('brief.generation');
    await store.getActive('brief.generation');
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it('also caches the "no version found" answer to avoid hammering the DB on bootstrap', async () => {
    const { pool, queryMock } = fakePool({ rows: [] });
    const store = new PromptStore(pool, { cacheTtlMs: 60_000 });
    const a = await store.getActive('not.registered');
    const b = await store.getActive('not.registered');
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(queryMock).toHaveBeenCalledOnce();
  });

  it('refreshes after TTL expires', async () => {
    const { pool, queryMock } = fakePool({ rows: [sampleRow] });
    const store = new PromptStore(pool, { cacheTtlMs: 0 });
    await store.getActive('brief.generation');
    await store.getActive('brief.generation');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('returns null and does NOT throw when the DB is unreachable — caller falls back', async () => {
    const { pool } = fakePool({ shouldFail: true });
    const store = new PromptStore(pool);
    // No throw: ai-gateway stays available even if prompt DB is down.
    const result = await store.getActive('brief.generation');
    expect(result).toBeNull();
  });

  it('does NOT cache failure — next call retries the DB', async () => {
    let failOnce = true;
    const queryMock = vi.fn(async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error('transient');
      }
      return { rows: [sampleRow] };
    });
    const pool = { query: queryMock } as unknown as RoomardPool;
    const store = new PromptStore(pool, { cacheTtlMs: 60_000 });

    const first = await store.getActive('brief.generation');
    const second = await store.getActive('brief.generation');

    expect(first).toBeNull(); // failure swallowed
    expect(second).not.toBeNull(); // retry succeeded
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('invalidate() clears all cached entries', async () => {
    const { pool, queryMock } = fakePool({ rows: [sampleRow] });
    const store = new PromptStore(pool, { cacheTtlMs: 60_000 });
    await store.getActive('brief.generation');
    store.invalidate();
    await store.getActive('brief.generation');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});

describe('substitute', () => {
  it('replaces {{var}} with values from vars', () => {
    const result = substitute('Hello {{name}}, you arrived on {{date}}.', {
      name: 'Alice',
      date: '2026-05-19',
    });
    expect(result).toBe('Hello Alice, you arrived on 2026-05-19.');
  });

  it('handles dotted paths', () => {
    const result = substitute('Tier: {{guest.loyaltyTier}}', {
      guest: { loyaltyTier: 'platinum' },
    });
    expect(result).toBe('Tier: platinum');
  });

  it('replaces unknown variables with empty string (not undefined)', () => {
    const result = substitute('A={{a}} B={{b}} C={{c}}', { a: 'x' });
    expect(result).toBe('A=x B= C=');
  });

  it('handles whitespace inside {{ }}', () => {
    const result = substitute('Hello {{  name  }}!', { name: 'Bob' });
    expect(result).toBe('Hello Bob!');
  });

  it('JSON-stringifies object values', () => {
    const result = substitute('Prefs: {{prefs}}', { prefs: ['tea', 'pillows'] });
    expect(result).toBe('Prefs: ["tea","pillows"]');
  });

  it('passes through templates with no variables', () => {
    expect(substitute('No vars here', {})).toBe('No vars here');
  });

  it('returns empty for null/undefined values without crashing', () => {
    expect(substitute('X={{x}}', { x: null })).toBe('X=');
    expect(substitute('X={{x}}', { x: undefined })).toBe('X=');
  });
});
