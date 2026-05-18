/**
 * Brief generation — UC-01 morning brief.
 *
 * Inputs:  property + brief_date (default = today in property timezone)
 * Outputs: brief row + N brief_items rows, ranked by priority (vip > attention > standard)
 *
 * Process:
 *   1. Look up arriving stays for the date
 *   2. For each guest: top 5 active preferences, last 30 days issues, loyalty tier
 *   3. Call AI gateway llm.brief with structured input
 *   4. Persist brief + items, mark status='ready'
 *
 * Idempotency: uses ON CONFLICT (tenant_id, property_id, brief_date) — re-running
 * with `force=true` regenerates; otherwise returns existing.
 */
import type { PoolClient } from 'pg';
import { ConflictError, NotFoundError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';

const log = createLogger({ name: 'brief.pipeline' });

interface ArrivalRow {
  guest_id: string;
  stay_id: string;
  display_name: string;
  room_number: string | null;
  arrival_at: Date;
  loyalty_tier: string | null;
  preferences: string[];
  recent_issues: string[];
}

export interface BriefDeps {
  aiInvoke(input: {
    capability: 'llm.brief';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{
    output: unknown;
    modelId: string;
    latencyMs: number;
    promptVersion?: string;
  }>;
}

export interface BriefInput {
  tenantId: string;
  propertyId: string;
  briefDate: string;
  requestId: string;
  force: boolean;
}

export interface BriefSummary {
  briefId: string;
  status: 'ready' | 'no_arrivals' | 'existing';
  totalArrivals: number;
  vipCount: number;
  attentionCount: number;
  generationDurationMs: number;
  modelId?: string;
}

export async function generateBrief(
  client: PoolClient,
  deps: BriefDeps,
  input: BriefInput,
): Promise<BriefSummary> {
  // Confirm property
  const { rows: propRows } = await client.query<{ id: string; timezone: string }>(
    `SELECT id, timezone FROM properties WHERE id = $1`,
    [input.propertyId],
  );
  if (propRows.length === 0) throw new NotFoundError('property not found');

  // Existing brief?
  const { rows: existingRows } = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM briefs WHERE property_id = $1 AND brief_date = $2`,
    [input.propertyId, input.briefDate],
  );
  if (existingRows.length > 0 && !input.force) {
    if (existingRows[0]!.status === 'generating') {
      throw new ConflictError('brief generation already in progress');
    }
    const stats = await loadExistingStats(client, existingRows[0]!.id);
    return {
      briefId: existingRows[0]!.id,
      status: 'existing',
      ...stats,
      generationDurationMs: 0,
    };
  }

  // Upsert brief row in 'generating'
  const { rows: briefRows } = await client.query<{ id: string }>(
    `INSERT INTO briefs (
       id, tenant_id, property_id, brief_date, status, vip_count, attention_count, total_arrivals
     ) VALUES (
       gen_random_uuid(),
       current_setting('app.tenant_id', false)::uuid,
       $1, $2, 'generating', 0, 0, 0
     )
     ON CONFLICT (tenant_id, property_id, brief_date) DO UPDATE
       SET status = 'generating', generated_at = NULL, items_json = NULL
     RETURNING id`,
    [input.propertyId, input.briefDate],
  );
  const briefId = briefRows[0]!.id;

  // Load arrivals
  const arrivals = await loadArrivals(client, input.propertyId, input.briefDate);

  if (arrivals.length === 0) {
    await client.query(
      `UPDATE briefs SET status = 'ready', total_arrivals = 0, generated_at = now() WHERE id = $1`,
      [briefId],
    );
    return {
      briefId,
      status: 'no_arrivals',
      totalArrivals: 0,
      vipCount: 0,
      attentionCount: 0,
      generationDurationMs: 0,
    };
  }

  const start = Date.now();
  const aiResult = await deps.aiInvoke({
    capability: 'llm.brief',
    tenantId: input.tenantId,
    requestId: input.requestId,
    payload: {
      briefDate: input.briefDate,
      arrivals: arrivals.map((a) => ({
        guestId: a.guest_id,
        displayName: a.display_name,
        preferences: a.preferences,
        recentIssues: a.recent_issues,
        loyaltyTier: a.loyalty_tier ?? undefined,
      })),
    },
  });
  const durationMs = Date.now() - start;

  const items =
    (aiResult.output as {
      items?: Array<{
        guestId: string;
        priority: 'vip' | 'attention' | 'standard';
        sayThis: string;
        callouts: string[];
      }>;
    }).items ?? [];

  // Clear prior items if regenerating
  await client.query(`DELETE FROM brief_items WHERE brief_id = $1`, [briefId]);

  // Sort: vip first, attention next, then standard
  const order = { vip: 0, attention: 1, standard: 2 } as const;
  items.sort((a, b) => order[a.priority] - order[b.priority]);

  let vipCount = 0;
  let attentionCount = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    const arrival = arrivals.find((a) => a.guest_id === item.guestId);
    if (!arrival) continue;
    if (item.priority === 'vip') vipCount += 1;
    if (item.priority === 'attention') attentionCount += 1;
    await client.query(
      `INSERT INTO brief_items (
         id, tenant_id, brief_id, guest_id, stay_id, priority,
         display_name, room_number, arrival_at, say_this_suggestion,
         preference_callouts, recent_issues, confidence, confidence_calibration, position
       ) VALUES (
         gen_random_uuid(),
         current_setting('app.tenant_id', false)::uuid,
         $1, $2, $3, $4::brief_item_priority,
         $5, $6, $7, $8,
         $9::text[], $10::text[], $11, 'ai-brief', $12
       )`,
      [
        briefId,
        item.guestId,
        arrival.stay_id,
        item.priority,
        arrival.display_name,
        arrival.room_number,
        arrival.arrival_at.toISOString(),
        item.sayThis,
        item.callouts,
        arrival.recent_issues,
        0.85,
        i,
      ],
    );
  }

  await client.query(
    `UPDATE briefs SET
       status = 'ready',
       vip_count = $2,
       attention_count = $3,
       total_arrivals = $4,
       generation_duration_ms = $5,
       model_id = $6,
       prompt_version = $7,
       generated_at = now()
     WHERE id = $1`,
    [briefId, vipCount, attentionCount, arrivals.length, durationMs, aiResult.modelId, aiResult.promptVersion ?? 'v1'],
  );

  log.info(
    { briefId, totalArrivals: arrivals.length, vipCount, attentionCount, durationMs },
    'brief generated',
  );

  return {
    briefId,
    status: 'ready',
    totalArrivals: arrivals.length,
    vipCount,
    attentionCount,
    generationDurationMs: durationMs,
    modelId: aiResult.modelId,
  };
}

async function loadArrivals(
  client: PoolClient,
  propertyId: string,
  briefDate: string,
): Promise<ArrivalRow[]> {
  const { rows: stayRows } = await client.query<{
    stay_id: string;
    guest_id: string;
    arrival_at: Date;
    room_number: string | null;
  }>(
    `SELECT s.id AS stay_id, s.guest_id, s.arrival_at, s.room_number
     FROM stays s
     WHERE s.property_id = $1
       AND s.arrival_at::date = $2::date
       AND s.status IN ('booked','expected','checked_in')
     ORDER BY s.arrival_at ASC`,
    [propertyId, briefDate],
  );

  if (stayRows.length === 0) return [];

  const guestIds = stayRows.map((s) => s.guest_id);
  const { rows: guestRows } = await client.query<{
    id: string;
    display_name: string;
    loyalty_tiers: Record<string, string> | null;
  }>(
    `SELECT id, display_name, loyalty_tiers FROM guests WHERE id = ANY($1::uuid[])`,
    [guestIds],
  );
  const guestMap = new Map(guestRows.map((g) => [g.id, g] as const));

  const { rows: prefRows } = await client.query<{ guest_id: string; detail: string; polarity: string }>(
    `SELECT guest_id, detail, polarity::text AS polarity FROM (
       SELECT guest_id, detail, polarity, confidence,
              row_number() OVER (PARTITION BY guest_id ORDER BY confidence DESC, last_reinforced_at DESC) AS rn
       FROM preferences
       WHERE guest_id = ANY($1::uuid[]) AND status = 'active'
     ) ranked WHERE rn <= 5`,
    [guestIds],
  );

  const prefMap = new Map<string, string[]>();
  for (const p of prefRows) {
    const arr = prefMap.get(p.guest_id) ?? [];
    arr.push(`${p.polarity}: ${p.detail}`);
    prefMap.set(p.guest_id, arr);
  }

  const { rows: issueRows } = await client.query<{
    guest_id: string;
    title: string;
    severity: number;
  }>(
    `SELECT guest_id, title, severity FROM issues
     WHERE guest_id = ANY($1::uuid[]) AND occurred_at > now() - interval '30 days'
     ORDER BY occurred_at DESC LIMIT 200`,
    [guestIds],
  );
  const issueMap = new Map<string, string[]>();
  for (const i of issueRows) {
    const arr = issueMap.get(i.guest_id) ?? [];
    if (arr.length < 3) {
      arr.push(`[sev ${i.severity}] ${i.title}`);
      issueMap.set(i.guest_id, arr);
    }
  }

  return stayRows.map((s) => {
    const g = guestMap.get(s.guest_id);
    const tiers = g?.loyalty_tiers ?? null;
    const loyaltyTier = tiers ? Object.values(tiers)[0] ?? null : null;
    return {
      guest_id: s.guest_id,
      stay_id: s.stay_id,
      display_name: g?.display_name ?? 'Unknown guest',
      room_number: s.room_number,
      arrival_at: s.arrival_at,
      loyalty_tier: loyaltyTier,
      preferences: prefMap.get(s.guest_id) ?? [],
      recent_issues: issueMap.get(s.guest_id) ?? [],
    };
  });
}

async function loadExistingStats(
  client: PoolClient,
  briefId: string,
): Promise<{ totalArrivals: number; vipCount: number; attentionCount: number }> {
  const { rows } = await client.query<{
    total_arrivals: number;
    vip_count: number;
    attention_count: number;
  }>(
    `SELECT total_arrivals, vip_count, attention_count FROM briefs WHERE id = $1`,
    [briefId],
  );
  const r = rows[0];
  return {
    totalArrivals: r?.total_arrivals ?? 0,
    vipCount: r?.vip_count ?? 0,
    attentionCount: r?.attention_count ?? 0,
  };
}

export async function loadBriefById(
  client: PoolClient,
  briefId: string,
): Promise<{
  brief: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
} | null> {
  const { rows: bRows } = await client.query(`SELECT * FROM briefs WHERE id = $1`, [briefId]);
  if (bRows.length === 0) return null;
  const { rows: items } = await client.query(
    `SELECT * FROM brief_items WHERE brief_id = $1 ORDER BY position ASC`,
    [briefId],
  );
  return { brief: bRows[0]!, items };
}
