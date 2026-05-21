/**
 * Capture service — REAL database integration tests (the G-43 regression guard).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The GET /v1/captures/:evidenceId handler joins `evidence` to `card_captures`.
 * It originally selected `e.captured_at` and `c.fields_json` — but the real
 * `evidence` table has `occurred_at` (not captured_at) and the real `card_captures`
 * table has `extracted_fields` (not fields_json). The route therefore 500'd for any
 * real id (and even a NOT-FOUND id 500'd before reaching the empty-rows branch).
 * That is G-43. No unit test caught it because capture-svc has no server-level unit
 * test for this route, and the pipeline unit tests mock the DB.
 *
 * This suite builds the real server via buildServer() with a REAL RoomardPool and an
 * in-memory object store, seeds one evidence + card_capture row, and drives the real
 * GET route with app.inject(). The handler's SQL runs against real Postgres, so any
 * column drift raises 42703 and fails the test. It also asserts the corrected
 * behaviour: an unknown id returns a clean 404 (not a 500).
 *
 * GATING: skips cleanly when DATABASE_URL is unset.
 */
import { RoomardPool } from '@roomard/db';
import { mintTestToken } from '@roomard/test-utils';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryObjectStore } from '../../src/object-store.js';
import { buildServer } from '../../src/server.js';

const TENANT = '00000000-0000-4000-8000-000000000001';
const PROPERTY = '00000000-0000-4000-8000-000000000010';
const EVIDENCE_ID = '00000000-0000-4000-8000-0000000e4301';
const UNKNOWN_ID = '00000000-0000-4000-8000-0000000e43ff';

const skipReason = !process.env.DATABASE_URL
  ? 'DATABASE_URL not set — skipping capture-svc DB integration tests'
  : null;
const describeOrSkip = skipReason ? describe.skip : describe;

if (skipReason) {
  // eslint-disable-next-line no-console
  console.log(`[capture integration] ${skipReason}`);
}

describeOrSkip('capture-svc · real-DB integration (G-43 regression guard)', () => {
  let app: FastifyInstance;
  let pool: RoomardPool;
  let raw: Pool;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    raw = new Pool({ connectionString: process.env.DATABASE_URL });
    pool = new RoomardPool({ connectionString: process.env.DATABASE_URL! });

    await raw.query(
      `INSERT INTO tenants (id, slug, name, tier, status, data_residency)
       VALUES ($1, 'demo', 'Roomard Demo Hotels', 'group', 'active', 'eu')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    await raw.query(
      `INSERT INTO properties (id, tenant_id, name, short_code, timezone, locale, status)
       VALUES ($1, $2, 'Capture IT Property', 'CITP', 'Europe/London', 'en-GB', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [PROPERTY, TENANT],
    );

    // Seed one evidence row (kind=card_capture, status=processed) + its card_capture
    // detail row, with a fixed id so the read test is deterministic. Upsert so reruns
    // refresh the values.
    await raw.query(
      `INSERT INTO evidence (id, tenant_id, property_id, kind, status, occurred_at, raw_text, metadata)
       VALUES ($1, $2, $3, 'card_capture', 'processed', now() - interval '1 hour',
               'Likes Earl Grey tea', '{}'::jsonb)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, raw_text = EXCLUDED.raw_text`,
      [EVIDENCE_ID, TENANT, PROPERTY],
    );
    await raw.query(
      `INSERT INTO card_captures (evidence_id, tenant_id, image_object_ref, extracted_fields, handwriting_detected)
       VALUES ($1, $2, 'minio://captures/it-card.png',
               jsonb_build_object('preference', 'Earl Grey tea', 'pillows', 'two firm'), true)
       ON CONFLICT (evidence_id) DO UPDATE SET extracted_fields = EXCLUDED.extracted_fields`,
      [EVIDENCE_ID, TENANT],
    );

    app = buildServer({
      pool,
      aiGatewayUrl: 'http://127.0.0.1:65535', // unused by the read path
      objectStore: new InMemoryObjectStore(),
    });
    await app.ready();
    token = await mintTestToken({ roles: ['admin'], tenantId: TENANT });
  });

  afterAll(async () => {
    await app.close();
    await pool.close();
    await raw.end();
  });

  it('GET /v1/captures/:id runs the real evidence⋈card_captures SELECT (would 42703 on the pre-fix captured_at/fields_json columns)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/captures/${EVIDENCE_ID}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as {
      id?: string;
      kind?: string;
      captured_at?: string;
      fields_json?: Record<string, unknown>;
    };
    expect(body.id).toBe(EVIDENCE_ID);
    expect(body.kind).toBe('card_capture');
    // captured_at is the real `occurred_at` column aliased — must be a valid date.
    expect(() => new Date(body.captured_at!).toISOString()).not.toThrow();
    // fields_json is the real `extracted_fields` column aliased — assert real content.
    expect(body.fields_json).toMatchObject({ preference: 'Earl Grey tea' });
  });

  it('GET /v1/captures/:id with an unknown id returns a clean 404 (the G-43 fix: was a 500)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/captures/${UNKNOWN_ID}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode, res.body).toBe(404);
  });

  it('the real schema genuinely lacks the phantom columns G-43 referenced (proves the tests above have teeth)', async () => {
    const cols = await raw.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_name IN ('evidence','card_captures')`,
    );
    const set = new Set(cols.rows.map((r) => `${r.table_name}.${r.column_name}`));
    expect(set.has('evidence.captured_at')).toBe(false); // real col is occurred_at
    expect(set.has('card_captures.fields_json')).toBe(false); // real col is extracted_fields
    expect(set.has('evidence.occurred_at')).toBe(true);
    expect(set.has('card_captures.extracted_fields')).toBe(true);
  });
});
