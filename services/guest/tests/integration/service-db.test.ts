/**
 * Guest service — REAL database integration tests (the G-41 regression guard).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The unit tests in tests/unit/service.test.ts drive GuestRepo with a hand-written
 * fake `client.query` that returns whatever rows the test author typed. That proves
 * the row->DTO MAPPING logic, but it canNOT prove the SQL is valid against the real
 * schema — the fake never parses the SQL or checks column names. That blind spot is
 * exactly how G-41 shipped: `getPreferences` selected `p.confidence_calibration` and
 * `p.source`, and `getHistory`/`analyseComplaintTrajectory` selected `occurred_at`
 * and `title` — none of which exist on the real `preferences`/`issues` tables. Every
 * unit test stayed green while all three endpoints returned HTTP 500 in production
 * (caught only when the demo was recorded against the live stack).
 *
 * These tests close that gap properly: they run the ACTUAL exported service code
 * (GuestRepo + analyseComplaintTrajectory) against a REAL Postgres database, inside
 * the same withTenantContext transaction the production server uses. If any query
 * references a column that does not exist, Postgres raises error 42703 and the test
 * FAILS — which is precisely what we want, and what the unit suite could not do.
 *
 * Each `it(...)` states what it proves and which bug it guards against, so a reader
 * of the output understands the intent, not just a pass/fail.
 *
 * GATING: skips cleanly when DATABASE_URL is unset (same convention as the existing
 * packages/db integration tests), so `pnpm -r test` stays green locally without a DB,
 * and runs for real in CI / against the live container Postgres.
 */
import { RoomardPool, withTenantContext } from '@roomard/db';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GuestRepo, analyseComplaintTrajectory } from '../../src/service.js';

const TENANT = '00000000-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-8000-000000000100';

const skipReason = !process.env.DATABASE_URL
  ? 'DATABASE_URL not set — skipping guest-svc DB integration tests'
  : null;
const describeOrSkip = skipReason ? describe.skip : describe;

if (skipReason) {
  // Make the skip visible in the output rather than silently vanishing.
  // eslint-disable-next-line no-console
  console.log(`[guest integration] ${skipReason}`);
}

function ctx(requestId: string) {
  return { tenantId: TENANT, userId: USER, actorKind: 'user' as const, requestId };
}

describeOrSkip('guest-svc · real-DB integration (G-41 regression guard)', () => {
  let raw: Pool;
  let pool: RoomardPool;
  let guestId: string;

  beforeAll(async () => {
    raw = new Pool({ connectionString: process.env.DATABASE_URL });
    pool = new RoomardPool({ connectionString: process.env.DATABASE_URL! });

    // Ensure the tenant exists (other suites may have created it; ON CONFLICT no-op).
    await raw.query(
      `INSERT INTO tenants (id, slug, name, tier, status, data_residency)
       VALUES ($1, 'tenant-guest-it', 'Guest IT', 'property', 'active', 'eu')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );

    // Ensure the property the seeded stay references exists (FK target).
    await raw.query(
      `INSERT INTO properties (id, tenant_id, name, short_code, timezone, locale, status)
       VALUES ('00000000-0000-4000-8000-000000000010', $1, 'IT Property', 'ITP', 'Europe/London', 'en-GB', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );

    // Seed a guest + one active preference + one stay + one issue, all under tenant
    // context so RLS and the audit trigger behave exactly as in production.
    guestId = await withTenantContext(pool, ctx('00000000-0000-4000-8000-0000000c1001'), async (client) => {
      const g = await client.query<{ id: string }>(
        `INSERT INTO guests (id, tenant_id, display_name, email_lower)
         VALUES (gen_random_uuid(), $1, 'Integration Test Guest', 'guest-it@example.com')
         RETURNING id`,
        [TENANT],
      );
      const id = g.rows[0]!.id;

      // Real `preferences` columns: kind, polarity, detail, confidence, status, metadata...
      await client.query(
        `INSERT INTO preferences (id, tenant_id, guest_id, kind, polarity, detail, confidence, status, metadata)
         VALUES (gen_random_uuid(), $1, $2, 'room_position', 'likes', 'quiet end of corridor', 0.91, 'active',
                 jsonb_build_object('source','observed'))`,
        [TENANT, id],
      );

      // Real `stays` columns: property_id, arrival_at, departure_at, status, room_number...
      // The booking id is unique per run (derived from the fresh guest id) so the suite
      // is idempotent and never trips the (tenant, pms_provider, pms_booking_id) unique
      // constraint when re-run against the dev DB.
      const bookingId = `IT-BOOK-${id.slice(0, 8)}`;
      await client.query(
        `INSERT INTO stays (id, tenant_id, property_id, guest_id, pms_booking_id, pms_provider,
                            arrival_at, departure_at, status, room_number)
         VALUES (gen_random_uuid(), $1, '00000000-0000-4000-8000-000000000010', $2,
                 $3, 'manual',
                 now() - interval '40 days', now() - interval '38 days', 'checked_out', '204')`,
        [TENANT, id, bookingId],
      );

      // Real `issues` columns: category, severity, summary, detail, raised_at...
      // (NOT `title`/`occurred_at` — those were the G-41 phantom columns.)
      await client.query(
        `INSERT INTO issues (id, tenant_id, guest_id, property_id, category, severity, summary, detail, raised_at)
         VALUES (gen_random_uuid(), $1, $2, '00000000-0000-4000-8000-000000000010', 'service', 3,
                 'Late housekeeping', 'Room not serviced until 4pm', now() - interval '30 days')`,
        [TENANT, id],
      );
      return id;
    });
  });

  afterAll(async () => {
    await pool.close();
    await raw.end();
  });

  it('getPreferences runs the real SELECT against the real `preferences` table (would 42703 on the pre-fix confidence_calibration/source columns)', async () => {
    const prefs = await withTenantContext(pool, ctx('00000000-0000-4000-8000-0000000c1002'), (client) =>
      new GuestRepo().getPreferences(client, guestId),
    );
    expect(prefs.length).toBeGreaterThanOrEqual(1);
    const p = prefs.find((x) => x.detail === 'quiet end of corridor');
    expect(p, 'seeded preference should come back from the real query').toBeTruthy();
    expect(p!.kind).toBe('room_position');
    // confidence.calibration is now a code-side default ('heuristic'), not a DB column.
    expect(p!.confidence.calibration).toBe('heuristic');
    // source now derives from metadata->>'source' (we seeded 'observed').
    expect(p!.source).toBe('observed');
  });

  it('getHistory runs the real SELECT against `stays` + `issues` (would 42703 on the pre-fix `title` column)', async () => {
    const history = await withTenantContext(pool, ctx('00000000-0000-4000-8000-0000000c1003'), (client) =>
      new GuestRepo().getHistory(client, guestId),
    );
    expect(history.stays.length).toBeGreaterThanOrEqual(1);
    expect(history.issues.length).toBeGreaterThanOrEqual(1);
    // `title` in the DTO is the real `summary` column aliased — assert the real value.
    expect(history.issues[0]!.title).toBe('Late housekeeping');
    // `occurredAt` is the real `raised_at` column aliased — must be a valid ISO date.
    expect(() => new Date(history.issues[0]!.occurredAt).toISOString()).not.toThrow();
  });

  it('analyseComplaintTrajectory runs the real issues SELECT (would 42703 on the pre-fix occurred_at/title columns)', async () => {
    // One issue < threshold, so this returns the rule-based fast path WITHOUT calling AI —
    // but it still executes the real SQL, which is the bit that used to throw.
    const verdict = await withTenantContext(pool, ctx('00000000-0000-4000-8000-0000000c1004'), (client) =>
      analyseComplaintTrajectory(
        client,
        { aiInvoke: async () => ({ output: { trajectory: 'stable', reasoning: [] }, modelId: 'test' }) },
        { guestId, tenantId: TENANT, requestId: '00000000-0000-4000-8000-0000000c1004' },
      ),
    );
    expect(verdict.guestId).toBe(guestId);
    // We seeded exactly one issue in the last 12 months.
    expect(verdict.issueCount12mo).toBe(1);
    expect(verdict.reason).toBe('below_threshold');
    // The one issue must have been read via the real columns and surfaced intact.
    expect(verdict.issuesConsidered[0]!.title).toBe('Late housekeeping');
  });

  it('the real schema genuinely lacks the phantom columns G-41 referenced (proves the tests above have teeth)', async () => {
    // Meta-assertion: confirm the buggy columns really do not exist, so the integration
    // tests above would actually have failed pre-fix (not passed for an unrelated reason).
    const cols = await raw.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('preferences','issues')`,
    );
    const names = new Set(cols.rows.map((r) => r.column_name));
    expect(names.has('confidence_calibration')).toBe(false);
    expect(names.has('occurred_at')).toBe(false); // issues uses raised_at
    expect(names.has('title')).toBe(false); // issues uses summary
    // And the real columns the fix relies on DO exist:
    expect(names.has('confidence')).toBe(true);
    expect(names.has('raised_at')).toBe(true);
    expect(names.has('summary')).toBe(true);
  });
});
