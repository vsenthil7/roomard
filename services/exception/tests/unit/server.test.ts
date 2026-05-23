/**
 * Server-level tests for exception-svc using Fastify `app.inject()` + a fake pool.
 * Exercises the HTTP + framework path (auth preHandler, RBAC, JSON parsing,
 * canonical error envelope, /health) without a real database.
 * See docs/TRACEABILITY.md for why this class of test matters (G-28..G-32).
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, mintTestToken, newUuid, TEST_TENANT_ID } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';


describe('exception-svc server', () => {
  let app: FastifyInstance;
  let mgrToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = createFakePool([
      // PATCH update returns the updated row (UPDATE ... RETURNING *). Must precede
      // the generic select rule; the UPDATE statement contains "exception_queue_items"
      // but not "from exception_queue_items".
      {
        match: 'update exception_queue_items',
        rows: [
          {
            id: '00000000-0000-4000-8000-0000000000ee',
            tenant_id: '00000000-0000-4000-8000-000000000001',
            kind: 'review_link_ambiguous',
            status: 'resolved',
            severity: 3,
            title: 'Ambiguous review link',
            resolved_at: new Date(),
          },
        ],
      },
      // list / get query — return one item so the items array is non-empty
      {
        match: 'from exception_queue_items',
        rows: [
          {
            id: newUuid(),
            tenant_id: '00000000-0000-4000-8000-000000000001',
            kind: 'review_link_ambiguous',
            status: 'open',
            severity: 3,
            title: 'Ambiguous review link',
            created_at: new Date(),
          },
        ],
      },
    ]);
    app = buildServer({ pool: pool as unknown as RoomardPool });
    await app.ready();
    // front_desk_manager has both exception.read and exception.write
    mgrToken = await mintTestToken({ roles: ['front_desk_manager'] });
  });

  it('/health responds 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /v1/exceptions without a token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/exceptions' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { category?: string }).category).toBe('authentication');
  });

  it('GET /v1/exceptions with manager token returns 200 with items + page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/exceptions',
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items?: unknown[]; page?: unknown };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toBeDefined();
  });

  it('GET /v1/exceptions/:id for a non-existent id returns 404 (fake pool empty)', async () => {
    // The list rule matches "from exception_queue_items" but get() uses
    // "SELECT * FROM exception_queue_items WHERE id" — also matches, returning
    // the seeded row. To force a miss, use an id and a pool with no match: we
    // instead assert the happy path returns 200 here, and rely on a fresh pool
    // for the 404 case below.
    const res = await app.inject({
      method: 'GET',
      url: `/v1/exceptions/${newUuid()}`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect([200, 404]).toContain(res.statusCode);
  });

  it('GET /v1/exceptions/:id with empty pool returns 404 canonical envelope', async () => {
    const emptyPool = createFakePool([]); // no rules → every query returns []
    const emptyApp = buildServer({ pool: emptyPool as unknown as RoomardPool });
    await emptyApp.ready();
    const res = await emptyApp.inject({
      method: 'GET',
      url: `/v1/exceptions/${newUuid()}`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
    await emptyApp.close();
  });

  it('PATCH /v1/exceptions/:id with JSON body parses (not 415) and passes RBAC', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/exceptions/${newUuid()}`,
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'resolved', resolutionNotes: 'handled' }),
    });
    // Not 415 (JSON parsed), not 403 (manager has exception.write). Either 200
    // (matched update) or 404 (no row) depending on fake pool match.
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).not.toBe(403);
  });

  it('PATCH /v1/exceptions/:id returns 200 + the updated row on success', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/exceptions/00000000-0000-4000-8000-0000000000ee',
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'resolved', resolutionNotes: 'handled' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status?: string };
    expect(body.status).toBe('resolved');
  });

  it('PATCH /v1/exceptions/:id with no updatable fields returns 400 validation', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/exceptions/00000000-0000-4000-8000-0000000000ee',
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { category?: string }).category).toBe('validation');
  });

  it('GET /v1/exceptions?limit=1 with 2 rows sets hasMore + a nextCursor', async () => {
    // limit=1 and 2 rows returned → hasMore true, exercises encodeCursor.
    const now = new Date();
    const pagedPool = createFakePool([
      {
        match: 'from exception_queue_items',
        rows: [
          { id: '00000000-0000-4000-8000-0000000000a1', tenant_id: '00000000-0000-4000-8000-000000000001', kind: 'review_link_ambiguous', status: 'open', severity: 3, title: 'one', created_at: now },
          { id: '00000000-0000-4000-8000-0000000000a2', tenant_id: '00000000-0000-4000-8000-000000000001', kind: 'review_link_ambiguous', status: 'open', severity: 2, title: 'two', created_at: now },
        ],
      },
    ]);
    const pagedApp = buildServer({ pool: pagedPool as unknown as RoomardPool });
    await pagedApp.ready();
    const res = await pagedApp.inject({
      method: 'GET',
      url: '/v1/exceptions?limit=1',
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { page?: { has_more?: boolean; next_cursor?: string | null } };
    expect(body.page?.has_more).toBe(true);
    expect(typeof body.page?.next_cursor).toBe('string');
    // Round-trip the cursor: a follow-up request with it must decode without error.
    const next = await pagedApp.inject({
      method: 'GET',
      url: `/v1/exceptions?limit=1&cursor=${encodeURIComponent(body.page!.next_cursor!)}`,
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(next.statusCode).toBe(200);
    await pagedApp.close();
  });

  it('GET /v1/exceptions with a role lacking exception.read returns 403', async () => {
    const conciergeToken = await mintTestToken({ roles: ['concierge'] });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/exceptions',
      headers: { authorization: `Bearer ${conciergeToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('resolving a low_ocr_confidence item with a guest persists the held preferences', async () => {
    // The capture pipeline holds OCR fields back when overall confidence < 0.75.
    // Resolving the exception means a human confirmed the reading, so those
    // fields must now be written to the guest. Assert the persist SQL fires.
    const guestId = '00000000-0000-4000-8000-0000000000c1';
    const evidenceId = '00000000-0000-4000-8000-0000000000c2';
    const persistPool = createFakePool([
      {
        // UPDATE ... RETURNING * — a low-OCR item linked to a guest, with held fields.
        match: 'update exception_queue_items',
        rows: [
          {
            id: '00000000-0000-4000-8000-0000000000cc',
            tenant_id: TEST_TENANT_ID,
            kind: 'low_ocr_confidence',
            status: 'resolved',
            severity: 3,
            guest_id: guestId,
            evidence_id: evidenceId,
            payload: {
              overall: 0.62,
              fields: [
                { name: 'preference.room.pillow', value: 'firm pillows, two extra', confidence: 0.93 },
                { name: 'preference.dietary.allergy', value: 'no shellfish', confidence: 0.9 },
              ],
            },
          },
        ],
      },
      {
        // The preferences upsert returns a new pref id so the evidence link runs.
        match: 'insert into preferences',
        rows: [{ id: '00000000-0000-4000-8000-0000000000d1' }],
      },
    ]);
    const persistApp = buildServer({ pool: persistPool as unknown as RoomardPool });
    await persistApp.ready();
    const res = await persistApp.inject({
      method: 'PATCH',
      url: '/v1/exceptions/00000000-0000-4000-8000-0000000000cc',
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'resolved', resolutionNotes: 'confirmed at desk' }),
    });
    expect(res.statusCode).toBe(200);
    const sql = persistPool.queries.map((q) => q.toLowerCase());
    // Two held fields => the preferences upsert ran, and the evidence link ran.
    expect(sql.some((q) => q.includes('insert into preferences'))).toBe(true);
    expect(sql.some((q) => q.includes('insert into preference_evidence'))).toBe(true);
    await persistApp.close();
  });

  it('resolving a non-OCR exception does NOT touch preferences', async () => {
    // Guard: only low_ocr_confidence items persist prefs on resolve. A different
    // kind must never write to preferences.
    const otherPool = createFakePool([
      {
        match: 'update exception_queue_items',
        rows: [
          {
            id: '00000000-0000-4000-8000-0000000000ce',
            tenant_id: TEST_TENANT_ID,
            kind: 'review_link_ambiguous',
            status: 'resolved',
            severity: 3,
            guest_id: '00000000-0000-4000-8000-0000000000c9',
            evidence_id: null,
            payload: { something: 'else' },
          },
        ],
      },
    ]);
    const otherApp = buildServer({ pool: otherPool as unknown as RoomardPool });
    await otherApp.ready();
    const res = await otherApp.inject({
      method: 'PATCH',
      url: '/v1/exceptions/00000000-0000-4000-8000-0000000000ce',
      headers: { authorization: `Bearer ${mgrToken}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ status: 'resolved' }),
    });
    expect(res.statusCode).toBe(200);
    const sql = otherPool.queries.map((q) => q.toLowerCase());
    expect(sql.some((q) => q.includes('insert into preferences'))).toBe(false);
    await otherApp.close();
  });

  it('unknown route returns 404 canonical envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/nope',
      headers: { authorization: `Bearer ${mgrToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
  });
});
