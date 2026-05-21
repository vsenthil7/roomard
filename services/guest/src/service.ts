/**
 * Guest service — the canonical guest read/write surface.
 * All queries run inside withTenantContext so RLS applies and the audit
 * trigger captures actor + request_id.
 */
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@roomard/errors';
import type {
  Guest,
  GuestCreateRequest,
  GuestPatchRequest,
  GuestSearchQuery,
  Preference,
  SayThisSuggestion,
} from '@roomard/schemas';
import type { PoolClient } from 'pg';

interface GuestRow {
  id: string;
  tenant_id: string;
  display_name: string;
  email: string | null;
  email_lower: string | null;
  phone_e164: string | null;
  home_country_code: string | null;
  name_variants: string[] | null;
  pms_guest_ids: Record<string, string> | null;
  loyalty_tiers: Record<string, string> | null;
  attention_flags: string[] | null;
  processing_restrictions: string[] | null;
  created_at: Date;
  updated_at: Date;
}

function rowToGuest(r: GuestRow): Guest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    displayName: r.display_name,
    email: r.email ?? undefined,
    phoneE164: r.phone_e164 ?? undefined,
    homeCountryCode: r.home_country_code ?? undefined,
    nameVariants: r.name_variants ?? [],
    loyaltyTiers: r.loyalty_tiers ?? {},
    attentionFlags: r.attention_flags ?? [],
    processingRestrictions: r.processing_restrictions ?? [],
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export class GuestRepo {
  async create(client: PoolClient, input: GuestCreateRequest): Promise<Guest> {
    if (input.email) {
      const { rows: dups } = await client.query<{ id: string }>(
        `SELECT id FROM guests WHERE email_lower = lower($1) LIMIT 1`,
        [input.email],
      );
      if (dups.length > 0) {
        throw new ConflictError('guest with this email already exists', {
          existingGuestId: dups[0]!.id,
        });
      }
    }
    const { rows } = await client.query<GuestRow>(
      `INSERT INTO guests (
        id, tenant_id, display_name, email, phone_e164, home_country_code,
        name_variants, pms_guest_ids, attention_flags
      ) VALUES (
        gen_random_uuid(),
        current_setting('app.tenant_id', false)::uuid,
        $1, $2, $3, $4,
        COALESCE($5::text[], ARRAY[]::text[]),
        COALESCE($6::jsonb, '{}'::jsonb),
        COALESCE($7::text[], ARRAY[]::text[])
      )
      RETURNING *`,
      [
        input.displayName,
        input.email ?? null,
        input.phoneE164 ?? null,
        input.homeCountryCode ?? null,
        input.nameVariants ?? null,
        input.pmsGuestIds ? JSON.stringify(input.pmsGuestIds) : null,
        input.attentionFlags ?? null,
      ],
    );
    return rowToGuest(rows[0]!);
  }

  async getById(client: PoolClient, id: string): Promise<Guest> {
    const { rows } = await client.query<GuestRow>(
      `SELECT * FROM guests WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundError('guest not found');
    return rowToGuest(rows[0]!);
  }

  async patch(client: PoolClient, id: string, input: GuestPatchRequest): Promise<Guest> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const push = (col: string, value: unknown): void => {
      sets.push(`${col} = $${i}`);
      params.push(value);
      i += 1;
    };
    if (input.displayName !== undefined) push('display_name', input.displayName);
    if (input.email !== undefined) push('email', input.email);
    if (input.phoneE164 !== undefined) push('phone_e164', input.phoneE164);
    if (input.homeCountryCode !== undefined) push('home_country_code', input.homeCountryCode);
    if (input.nameVariants !== undefined) push('name_variants', input.nameVariants);
    if (input.attentionFlags !== undefined) push('attention_flags', input.attentionFlags);
    if (input.pmsGuestIds !== undefined) {
      sets.push(`pms_guest_ids = $${i}::jsonb`);
      params.push(JSON.stringify(input.pmsGuestIds));
      i += 1;
    }
    if (sets.length === 0) {
      throw new ValidationError('no fields to update');
    }
    params.push(id);
    const { rows } = await client.query<GuestRow>(
      `UPDATE guests SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i} RETURNING *`,
      params,
    );
    if (rows.length === 0) throw new NotFoundError('guest not found');
    return rowToGuest(rows[0]!);
  }

  async search(
    client: PoolClient,
    q: GuestSearchQuery,
  ): Promise<{
    items: Array<Guest & { matchScore?: number; activePreferenceCount: number; upcomingArrivalAt?: string }>;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const where: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (q.q) {
      where.push(`(display_name ILIKE '%' || $${i} || '%' OR email_lower = lower($${i}) OR $${i} = ANY(name_variants))`);
      params.push(q.q);
      i += 1;
    }
    if (q.email) {
      where.push(`email_lower = lower($${i})`);
      params.push(q.email);
      i += 1;
    }
    if (q.phone) {
      where.push(`phone_e164 = $${i}`);
      params.push(q.phone);
      i += 1;
    }
    const cursorRow = q.cursor ? decodeCursor(q.cursor) : null;
    if (cursorRow) {
      where.push(`(created_at, id) < ($${i}, $${i + 1})`);
      params.push(cursorRow.createdAt, cursorRow.id);
      i += 2;
    }

    const limit = Math.min(q.limit ?? 20, 100);
    params.push(limit + 1);
    const sql = `
      SELECT g.*,
             (SELECT count(*) FROM preferences p WHERE p.guest_id = g.id AND p.status = 'active') AS active_pref_count,
             (SELECT min(arrival_at) FROM stays s WHERE s.guest_id = g.id AND s.arrival_at > now()) AS upcoming_arrival_at
      FROM guests g
      ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY g.created_at DESC, g.id DESC
      LIMIT $${i}
    `;
    const { rows } = await client.query<
      GuestRow & { active_pref_count: string; upcoming_arrival_at: Date | null }
    >(sql, params);

    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);
    const last = slice.at(-1);
    return {
      items: slice.map((r) => ({
        ...rowToGuest(r),
        activePreferenceCount: Number.parseInt(r.active_pref_count, 10),
        upcomingArrivalAt: r.upcoming_arrival_at ? r.upcoming_arrival_at.toISOString() : undefined,
      })),
      nextCursor:
        hasMore && last ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id }) : null,
      hasMore,
    };
  }

  async getPreferences(client: PoolClient, guestId: string): Promise<Preference[]> {
    const { rows } = await client.query<{
      id: string;
      guest_id: string;
      kind: string;
      polarity: string;
      detail: string;
      confidence_value: string;
      confidence_calibration: string;
      status: string;
      source: string;
      first_observed_at: Date;
      last_reinforced_at: Date;
      reinforcement_count: number;
      supersedes_id: string | null;
    }>(
      `SELECT p.id, p.guest_id, p.kind::text, p.polarity::text, p.detail,
              p.confidence::text AS confidence_value, 'heuristic' AS confidence_calibration,
              p.status::text, COALESCE(p.metadata->>'source', 'observed') AS source,
              p.first_observed_at, p.last_reinforced_at,
              p.reinforcement_count, p.supersedes_id
       FROM preferences p
       WHERE p.guest_id = $1 AND p.status = 'active'
       ORDER BY p.confidence DESC, p.last_reinforced_at DESC`,
      [guestId],
    );

    const prefIds = rows.map((r) => r.id);
    const evidenceMap = new Map<string, string[]>();
    if (prefIds.length > 0) {
      const { rows: links } = await client.query<{ preference_id: string; evidence_id: string }>(
        `SELECT preference_id, evidence_id FROM preference_evidence WHERE preference_id = ANY($1::uuid[])`,
        [prefIds],
      );
      for (const l of links) {
        const arr = evidenceMap.get(l.preference_id) ?? [];
        arr.push(l.evidence_id);
        evidenceMap.set(l.preference_id, arr);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      guestId: r.guest_id,
      kind: r.kind as Preference['kind'],
      polarity: r.polarity as Preference['polarity'],
      detail: r.detail,
      confidence: {
        value: Number.parseFloat(r.confidence_value),
        calibration: r.confidence_calibration,
      },
      status: r.status as Preference['status'],
      source: r.source,
      firstObservedAt: r.first_observed_at.toISOString(),
      lastReinforcedAt: r.last_reinforced_at.toISOString(),
      reinforcementCount: r.reinforcement_count,
      evidenceIds: evidenceMap.get(r.id) ?? [],
      supersedesId: r.supersedes_id ?? undefined,
    }));
  }

  async getHistory(
    client: PoolClient,
    guestId: string,
  ): Promise<{
    stays: Array<{
      id: string;
      propertyId: string;
      arrivalAt: string;
      departureAt: string;
      status: string;
      roomNumber: string | null;
    }>;
    issues: Array<{
      id: string;
      severity: number;
      title: string;
      occurredAt: string;
      resolvedAt: string | null;
    }>;
  }> {
    const { rows: stays } = await client.query(
      `SELECT id, property_id, arrival_at, departure_at, status, room_number
       FROM stays WHERE guest_id = $1 ORDER BY arrival_at DESC LIMIT 50`,
      [guestId],
    );
    const { rows: issues } = await client.query(
      `SELECT id, severity, summary AS title, raised_at AS occurred_at, resolved_at
       FROM issues WHERE guest_id = $1 ORDER BY raised_at DESC LIMIT 50`,
      [guestId],
    );
    return {
      stays: stays.map((s) => ({
        id: String(s.id),
        propertyId: String(s.property_id),
        arrivalAt: (s.arrival_at as Date).toISOString(),
        departureAt: (s.departure_at as Date).toISOString(),
        status: String(s.status),
        roomNumber: s.room_number ? String(s.room_number) : null,
      })),
      issues: issues.map((i) => ({
        id: String(i.id),
        severity: Number(i.severity),
        title: String(i.title),
        occurredAt: (i.occurred_at as Date).toISOString(),
        resolvedAt: i.resolved_at ? (i.resolved_at as Date).toISOString() : null,
      })),
    };
  }
}

/**
 * SayThis builder — combines top 3 preferences and last issue into a 1-line
 * suggestion. Calls the AI gateway via `aiInvoke` (injected so tests can stub).
 */
export type AiInvokeCapability = 'llm.brief' | 'llm.review_link' | 'llm.reasoning';

export interface AiInvokeFn {
  (payload: {
    capability: AiInvokeCapability;
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{
    output: unknown;
    modelId: string;
    promptVersion?: string;
  }>;
}

export interface SayThisDeps {
  aiInvoke: AiInvokeFn;
}

export async function buildSayThis(
  client: PoolClient,
  deps: SayThisDeps,
  args: { guestId: string; tenantId: string; requestId: string },
): Promise<SayThisSuggestion> {
  const repo = new GuestRepo();
  const guest = await repo.getById(client, args.guestId);
  const prefs = await repo.getPreferences(client, args.guestId);
  const topPrefs = prefs.slice(0, 3).map((p) => `${p.polarity}: ${p.detail}`);
  const result = await deps.aiInvoke({
    capability: 'llm.brief',
    tenantId: args.tenantId,
    requestId: args.requestId,
    payload: {
      arrivals: [
        {
          guestId: guest.id,
          displayName: guest.displayName,
          preferences: topPrefs,
          recentIssues: [],
          loyaltyTier: Object.values(guest.loyaltyTiers ?? {})[0],
        },
      ],
    },
  });
  const items = (result.output as { items: Array<{ sayThis: string; callouts: string[] }> }).items;
  const first = items[0];
  return {
    guestId: guest.id,
    greeting: first ? first.sayThis : `Welcome ${guest.displayName}.`,
    context: topPrefs.join(' • '),
    preferenceCallouts: first?.callouts ?? topPrefs,
    generatedAt: new Date().toISOString(),
    promptVersion: result.promptVersion ?? 'v1',
    modelId: result.modelId,
  };
}

// ===========================================================================
// UC-11: Complaint trajectory analyser.
// ===========================================================================
//
// Threshold rule (BRD §6.1, UC-11):
//   - 3 or more issues in the last 12 months → guest flagged for review
//   - But: the *trajectory* matters more than the count. A guest with
//     "3 minor issues spread over 18 months" is different from "3 issues
//     in the last 60 days each more severe than the last".
//
// This is the natural caller for ERNIE X1 (llm.reasoning). The rule-based
// part returns the count and dates; the AI part returns a verdict on
// "is this guest's experience deteriorating?" with reasoning steps.
//
// We deliberately apply the 3-in-12-months rule deterministically (SQL)
// before calling AI — so AI only runs when there's something to reason
// about, keeping inference cost bounded.

export interface IssueRecord {
  id: string;
  occurredAt: string;
  severity: number;
  title: string;
  resolvedAt: string | null;
}

export interface TrajectoryVerdict {
  guestId: string;
  flagged: boolean;
  reason: 'no_issues' | 'below_threshold' | 'threshold_with_trajectory' | 'reasoning_unavailable';
  issueCount12mo: number;
  issuesConsidered: IssueRecord[];
  trajectory: 'stable' | 'improving' | 'deteriorating' | 'unknown';
  aiReasoning: string[];
  modelId?: string;
  promptVersion?: string;
  generatedAt: string;
}

export interface TrajectoryDeps {
  aiInvoke: AiInvokeFn;
}

const TRAJECTORY_ISSUE_THRESHOLD = 3;
const TRAJECTORY_LOOKBACK_MONTHS = 12;

export async function analyseComplaintTrajectory(
  client: PoolClient,
  deps: TrajectoryDeps,
  args: { guestId: string; tenantId: string; requestId: string },
): Promise<TrajectoryVerdict> {
  // Confirm guest exists (RLS already filters cross-tenant).
  const { rows: guestRows } = await client.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM guests WHERE id = $1`,
    [args.guestId],
  );
  if (guestRows.length === 0) {
    throw new Error('guest not found');
  }

  // Pull issues from the last N months.
  const { rows: issueRows } = await client.query<{
    id: string;
    occurred_at: Date;
    severity: number;
    title: string;
    resolved_at: Date | null;
  }>(
    `SELECT id, raised_at AS occurred_at, severity, summary AS title, resolved_at
     FROM issues
     WHERE guest_id = $1
       AND raised_at > now() - ($2 || ' months')::interval
     ORDER BY raised_at ASC`,
    [args.guestId, String(TRAJECTORY_LOOKBACK_MONTHS)],
  );

  const issues: IssueRecord[] = issueRows.map((r) => ({
    id: r.id,
    occurredAt: r.occurred_at.toISOString(),
    severity: r.severity,
    title: r.title,
    resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
  }));

  // Fast paths — no inference needed.
  if (issues.length === 0) {
    return {
      guestId: args.guestId,
      flagged: false,
      reason: 'no_issues',
      issueCount12mo: 0,
      issuesConsidered: [],
      trajectory: 'stable',
      aiReasoning: [],
      generatedAt: new Date().toISOString(),
    };
  }
  if (issues.length < TRAJECTORY_ISSUE_THRESHOLD) {
    return {
      guestId: args.guestId,
      flagged: false,
      reason: 'below_threshold',
      issueCount12mo: issues.length,
      issuesConsidered: issues,
      trajectory: 'unknown',
      aiReasoning: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // Threshold met. Ask ERNIE X1 to reason about whether the trajectory is
  // deteriorating. We pass a structured prompt; X1 returns a JSON-shaped
  // answer + reasoning steps.
  const prompt = buildTrajectoryPrompt(guestRows[0]!.display_name, issues);
  let aiResult: { output: unknown; modelId: string; promptVersion?: string } | null = null;
  try {
    aiResult = await deps.aiInvoke({
      capability: 'llm.reasoning',
      tenantId: args.tenantId,
      requestId: args.requestId,
      payload: { prompt },
    });
  } catch {
    // If reasoning is unavailable, still return the rule-based flag —
    // we don't want a flaky AI call to mask a real trajectory issue.
    return {
      guestId: args.guestId,
      flagged: true,
      reason: 'reasoning_unavailable',
      issueCount12mo: issues.length,
      issuesConsidered: issues,
      trajectory: 'unknown',
      aiReasoning: ['Trajectory inference unavailable — flagged on rule-based threshold alone.'],
      generatedAt: new Date().toISOString(),
    };
  }

  const parsed = parseReasoningOutput(aiResult.output);
  return {
    guestId: args.guestId,
    flagged: true,
    reason: 'threshold_with_trajectory',
    issueCount12mo: issues.length,
    issuesConsidered: issues,
    trajectory: parsed.trajectory,
    aiReasoning: parsed.reasoning,
    modelId: aiResult.modelId,
    promptVersion: aiResult.promptVersion,
    generatedAt: new Date().toISOString(),
  };
}

function buildTrajectoryPrompt(displayName: string, issues: IssueRecord[]): string {
  const lines = issues.map(
    (i) =>
      `- ${i.occurredAt.slice(0, 10)} (severity ${i.severity}): ${i.title}` +
      (i.resolvedAt ? ` [resolved ${i.resolvedAt.slice(0, 10)}]` : ' [unresolved]'),
  );
  return [
    `You are analysing the complaint trajectory of a hotel guest named ${displayName}.`,
    `The following issues were recorded over the last 12 months:`,
    ...lines,
    ``,
    `Determine whether this guest's experience is "improving", "stable", or "deteriorating".`,
    `Consider: severity trend, frequency trend, resolution speed, and whether unresolved issues remain.`,
    ``,
    `Return strict JSON in this shape:`,
    `{"trajectory": "improving|stable|deteriorating", "reasoning": ["step 1", "step 2", "step 3"], "answer": "1-sentence summary"}`,
  ].join('\n');
}

function parseReasoningOutput(output: unknown): {
  trajectory: 'stable' | 'improving' | 'deteriorating' | 'unknown';
  reasoning: string[];
} {
  if (typeof output !== 'object' || output === null) {
    return { trajectory: 'unknown', reasoning: [] };
  }
  // The mock returns { answer, reasoning } at the top level.
  // The real Qianfan call returns either parsed JSON or {rawText: ...} —
  // try to JSON-parse rawText if present.
  let obj = output as Record<string, unknown>;
  if (typeof obj.rawText === 'string') {
    try {
      obj = JSON.parse(obj.rawText) as Record<string, unknown>;
    } catch {
      return { trajectory: 'unknown', reasoning: [String(obj.rawText)] };
    }
  }
  const trajectory =
    obj.trajectory === 'improving' ||
    obj.trajectory === 'stable' ||
    obj.trajectory === 'deteriorating'
      ? obj.trajectory
      : 'unknown';
  const reasoning = Array.isArray(obj.reasoning)
    ? obj.reasoning.map(String)
    : typeof obj.answer === 'string'
      ? [obj.answer]
      : [];
  return { trajectory, reasoning };
}

function encodeCursor(input: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
