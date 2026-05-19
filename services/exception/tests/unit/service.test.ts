import { describe, it, expect, vi } from 'vitest';

import { ExceptionRepo } from '../../src/server.js';

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

describe('ExceptionRepo', () => {
  it('list builds WHERE clause from filters', async () => {
    const repo = new ExceptionRepo();
    const rows = [
      {
        id: 'e1',
        kind: 'low_confidence_ocr',
        status: 'open',
        severity: 3,
        title: 'OCR low conf',
        description: 'foo',
        created_at: new Date('2026-05-18T10:00:00Z'),
      },
    ];
    const client = fakeClient([
      (sql, params) => {
        expect(sql).toMatch(/WHERE status = \$1::exception_status/);
        expect(params[0]).toBe('open');
        return { rows };
      },
    ]);
    const out = await repo.list(client, { status: 'open', limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.hasMore).toBe(false);
  });

  it('get throws NotFoundError on missing row', async () => {
    const repo = new ExceptionRepo();
    const client = fakeClient([() => ({ rows: [] })]);
    await expect(repo.get(client, 'x')).rejects.toThrow(/not found/i);
  });

  it('patch sets resolved_at when status becomes resolved', async () => {
    const repo = new ExceptionRepo();
    const client = fakeClient([
      (sql) => {
        expect(sql).toMatch(/resolved_at = now\(\)/);
        return {
          rows: [
            {
              id: 'e1',
              status: 'resolved',
              resolved_at: new Date(),
              resolved_by: 'u1',
            },
          ],
        };
      },
    ]);
    const out = (await repo.patch(client, 'e1', { status: 'resolved' }, 'u1')) as {
      status: string;
    };
    expect(out.status).toBe('resolved');
  });

  it('patch refuses empty input', async () => {
    const repo = new ExceptionRepo();
    const client = fakeClient([]);
    await expect(repo.patch(client, 'e1', {}, 'u1')).rejects.toThrow(/no fields/i);
  });
});
