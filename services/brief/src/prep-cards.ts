/**
 * Housekeeping prep card pipeline — UC-09.
 *
 * Generates one prep card per stay arriving on `prepDate + 1` (D-1 generation).
 * Each card carries the curated room-prep items (pillows, allergies,
 * celebration setup, accessibility) and an optional AI-generated warm note.
 *
 * Idempotent: ON CONFLICT (stay_id, prep_date) updates the existing card.
 *
 * Lives in brief-svc rather than its own service to keep the deployment count
 * down — prep cards share the "stay → preferences → curated artefact" shape
 * with briefs. Different lifecycle (stay-scoped vs day-scoped) but same
 * pipeline plumbing.
 */
import { NotFoundError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import type { PoolClient } from 'pg';

const log = createLogger({ name: 'brief.prep-cards' });

// Cap on prep_items per card. Beyond ~8 items the card stops being scannable
// at a glance, which defeats the point. The cap is also a cost guardrail:
// the AI invocation includes the prep_items in the prompt.
const MAX_PREP_ITEMS = 8;

// Preference kinds relevant to room prep. Pulled from prefereces.kind enum.
// Order is priority for display.
const ROOM_PREP_KINDS = [
  'allergy',
  'accessibility',
  'pillow',
  'temperature',
  'celebration',
  'food',
  'beverage',
  'family',
  'pet',
  'room',
  'other',
];

export interface PrepCardGenerationInput {
  tenantId: string;
  propertyId: string;
  prepDate: string; // ISO date (YYYY-MM-DD) — the date prep happens, i.e. D-1
  requestId: string;
  /**
   * When true, regenerate even if a card already exists. Default false —
   * housekeepers may have already started prep and we don't want to silently
   * overwrite warm notes mid-day.
   */
  force?: boolean;
  /**
   * When true, generate an AI warm note. Default true. Set to false in test
   * paths or to suppress AI cost on uncomplicated arrivals.
   */
  includeWarmNote?: boolean;
}

export interface PrepCardGenerationSummary {
  propertyId: string;
  prepDate: string;
  arrivalDate: string;
  cardsCreated: number;
  cardsUpdated: number;
  cardsSkipped: number;
  warmNotesGenerated: number;
  errors: string[];
}

export interface PrepCardDeps {
  aiInvoke(input: {
    capability: 'llm.brief';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{ output: unknown; modelId: string; promptVersion?: string }>;
}

/**
 * Generate prep cards for every stay arriving on prepDate + 1.
 *
 * Process:
 *   1. Confirm property exists.
 *   2. Find arriving stays (arrival_date = prepDate + 1).
 *   3. For each stay: assemble prep items, optionally call AI for warm note,
 *      upsert into housekeeping_prep_cards.
 *   4. Return summary.
 */
export async function generatePrepCardsForDate(
  client: PoolClient,
  deps: PrepCardDeps,
  input: PrepCardGenerationInput,
): Promise<PrepCardGenerationSummary> {
  const { rows: propRows } = await client.query<{ id: string }>(
    `SELECT id FROM properties WHERE id = $1`,
    [input.propertyId],
  );
  if (propRows.length === 0) throw new NotFoundError('property not found');

  // Arrival day = prep_date + 1.
  const arrivalDate = addOneDay(input.prepDate);

  const { rows: arrivals } = await client.query<{
    stay_id: string;
    guest_id: string;
    display_name: string;
    room_number: string | null;
    arrival_at: Date;
    attention_flags: string[] | null;
  }>(
    `SELECT s.id AS stay_id, s.guest_id, g.display_name, s.room_number,
            s.arrival_at, g.attention_flags
     FROM stays s
     JOIN guests g ON g.id = s.guest_id
     WHERE s.property_id = $1
       AND s.arrival_at::date = $2::date
       AND s.status IN ('confirmed', 'checked_in')
     ORDER BY s.arrival_at ASC`,
    [input.propertyId, arrivalDate],
  );

  const summary: PrepCardGenerationSummary = {
    propertyId: input.propertyId,
    prepDate: input.prepDate,
    arrivalDate,
    cardsCreated: 0,
    cardsUpdated: 0,
    cardsSkipped: 0,
    warmNotesGenerated: 0,
    errors: [],
  };

  if (arrivals.length === 0) {
    log.info({ propertyId: input.propertyId, prepDate: input.prepDate }, 'no arrivals tomorrow');
    return summary;
  }

  for (const a of arrivals) {
    try {
      const result = await generateOnePrepCard(client, deps, {
        ...input,
        stayId: a.stay_id,
        guestId: a.guest_id,
        displayName: a.display_name,
        roomNumber: a.room_number,
        arrivalAt: a.arrival_at,
        attentionFlags: a.attention_flags ?? [],
      });
      if (result === 'created') summary.cardsCreated += 1;
      else if (result === 'updated') summary.cardsUpdated += 1;
      else summary.cardsSkipped += 1;
      if (result === 'created' || result === 'updated') {
        if ((input.includeWarmNote ?? true)) summary.warmNotesGenerated += 1;
      }
    } catch (err) {
      summary.errors.push(
        `stay ${a.stay_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  log.info(
    {
      propertyId: input.propertyId,
      prepDate: input.prepDate,
      created: summary.cardsCreated,
      updated: summary.cardsUpdated,
      skipped: summary.cardsSkipped,
    },
    'prep cards generated',
  );
  return summary;
}

async function generateOnePrepCard(
  client: PoolClient,
  deps: PrepCardDeps,
  args: {
    tenantId: string;
    propertyId: string;
    prepDate: string;
    requestId: string;
    force?: boolean;
    includeWarmNote?: boolean;
    stayId: string;
    guestId: string;
    displayName: string;
    roomNumber: string | null;
    arrivalAt: Date;
    attentionFlags: string[];
  },
): Promise<'created' | 'updated' | 'skipped'> {
  // Skip if a card already exists and force=false.
  if (!args.force) {
    const { rows: existing } = await client.query<{ id: string }>(
      `SELECT id FROM housekeeping_prep_cards
       WHERE stay_id = $1 AND prep_date = $2::date`,
      [args.stayId, args.prepDate],
    );
    if (existing.length > 0) return 'skipped';
  }

  // Fetch relevant preferences. The brief service already does this for
  // arrivals; we re-query here scoped to room-prep kinds and capped.
  const { rows: prefs } = await client.query<{
    kind: string;
    polarity: string;
    detail: string;
    confidence: string;
  }>(
    `SELECT kind::text AS kind, polarity::text AS polarity, detail, confidence::text AS confidence
     FROM preferences
     WHERE guest_id = $1
       AND status = 'active'
       AND kind::text = ANY($2::text[])
     ORDER BY confidence DESC, last_reinforced_at DESC
     LIMIT $3`,
    [args.guestId, ROOM_PREP_KINDS, MAX_PREP_ITEMS],
  );

  const prepItems = prefs.map((p) => formatPrepItem(p.kind, p.polarity, p.detail));

  // Optional AI warm note. Use the existing llm.brief capability with a
  // shaped payload; the brief response includes per-guest "sayThis" strings
  // which we repurpose as the warm note. If AI fails, the card is still
  // generated — just without the note.
  let warmNote: string | null = null;
  let modelId: string | null = null;
  let promptVersion: string | null = null;
  if (args.includeWarmNote ?? true) {
    try {
      const result = await deps.aiInvoke({
        capability: 'llm.brief',
        tenantId: args.tenantId,
        requestId: args.requestId,
        payload: {
          context: 'housekeeping_prep_card',
          arrivals: [
            {
              guestId: args.guestId,
              displayName: args.displayName,
              preferences: prepItems,
              recentIssues: [],
              loyaltyTier: undefined,
            },
          ],
        },
      });
      const items = (result.output as {
        items?: Array<{ sayThis?: string }>;
      }).items;
      warmNote = items?.[0]?.sayThis ?? null;
      modelId = result.modelId;
      promptVersion = result.promptVersion ?? null;
    } catch (err) {
      log.warn({ err, stayId: args.stayId }, 'warm note generation failed — card without note');
    }
  }

  // Upsert. The ON CONFLICT clause matches the unique index on (stay_id, prep_date).
  const { rows } = await client.query<{ was_inserted: boolean }>(
    `INSERT INTO housekeeping_prep_cards (
       id, tenant_id, property_id, stay_id, guest_id, prep_date,
       room_number, arrival_at, display_name,
       prep_items, attention_flags, warm_note,
       status, generated_at, model_id, prompt_version
     ) VALUES (
       gen_random_uuid(),
       current_setting('app.tenant_id', false)::uuid,
       $1, $2, $3, $4::date,
       $5, $6, $7,
       $8::text[], $9::text[], $10,
       'ready', now(), $11, $12
     )
     ON CONFLICT (stay_id, prep_date) DO UPDATE SET
       room_number = EXCLUDED.room_number,
       prep_items = EXCLUDED.prep_items,
       attention_flags = EXCLUDED.attention_flags,
       warm_note = EXCLUDED.warm_note,
       status = 'ready',
       generated_at = now(),
       model_id = EXCLUDED.model_id,
       prompt_version = EXCLUDED.prompt_version
     RETURNING (xmax = 0) AS was_inserted`,
    [
      args.propertyId,
      args.stayId,
      args.guestId,
      args.prepDate,
      args.roomNumber,
      args.arrivalAt.toISOString(),
      args.displayName,
      prepItems,
      args.attentionFlags,
      warmNote,
      modelId,
      promptVersion,
    ],
  );

  return rows[0]?.was_inserted ? 'created' : 'updated';
}

/**
 * Mark a prep card complete (housekeeper signs it off after prep is done).
 */
export async function completePrepCard(
  client: PoolClient,
  args: { cardId: string; userId: string; notes?: string },
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const { rowCount } = await client.query(
    `UPDATE housekeeping_prep_cards
     SET status = 'completed',
         completed_at = now(),
         completed_by = $1,
         completion_notes = $2
     WHERE id = $3 AND status IN ('pending', 'ready')`,
    [args.userId, args.notes ?? null, args.cardId],
  );
  if (rowCount === 0) return { ok: false, reason: 'not_found' };
  return { ok: true };
}

/**
 * Load all prep cards for a property on a given prep_date. Used by the
 * housekeeper mobile UI.
 */
export async function listPrepCards(
  client: PoolClient,
  args: { propertyId: string; prepDate: string },
): Promise<
  Array<{
    id: string;
    stayId: string;
    guestId: string;
    displayName: string;
    roomNumber: string | null;
    arrivalAt: string;
    prepItems: string[];
    attentionFlags: string[];
    warmNote: string | null;
    status: string;
    completedAt: string | null;
  }>
> {
  const { rows } = await client.query<{
    id: string;
    stay_id: string;
    guest_id: string;
    display_name: string;
    room_number: string | null;
    arrival_at: Date;
    prep_items: string[];
    attention_flags: string[];
    warm_note: string | null;
    status: string;
    completed_at: Date | null;
  }>(
    `SELECT id, stay_id, guest_id, display_name, room_number, arrival_at,
            prep_items, attention_flags, warm_note, status::text, completed_at
     FROM housekeeping_prep_cards
     WHERE property_id = $1 AND prep_date = $2::date
     ORDER BY arrival_at ASC, room_number ASC NULLS LAST`,
    [args.propertyId, args.prepDate],
  );
  return rows.map((r) => ({
    id: r.id,
    stayId: r.stay_id,
    guestId: r.guest_id,
    displayName: r.display_name,
    roomNumber: r.room_number,
    arrivalAt: r.arrival_at.toISOString(),
    prepItems: r.prep_items,
    attentionFlags: r.attention_flags,
    warmNote: r.warm_note,
    status: r.status,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
  }));
}

function formatPrepItem(kind: string, polarity: string, detail: string): string {
  // "allergy: peanuts" reads better than "allergy(allergy): peanuts".
  // Drop polarity for the allergy/requirement kinds where it's redundant.
  if (polarity === 'allergy' || polarity === 'requirement') {
    return `${polarity}: ${detail}`;
  }
  return `${kind}: ${detail}`;
}

function addOneDay(isoDate: string): string {
  // isoDate is YYYY-MM-DD. Parse as UTC midnight and add 24h to dodge DST surprises.
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
