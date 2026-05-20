/**
 * Review polling + linking (UC-25).
 *
 * Architecture:
 *  - Poller fetches reviews from external sources (TripAdvisor, Booking.com,
 *    Google Business Profile) on a per-property schedule.
 *  - Source adapters are pluggable. Each adapter implements ReviewSource and
 *    returns ExternalReview[]. Real adapters need API credentials; for tests
 *    and the unconfigured-tenant path we provide a fake adapter.
 *  - Ingested reviews are deduplicated by (tenant_id, source, external_id)
 *    via the unique index on the reviews table (migration 0010).
 *  - Linking calls the AI gateway with capability 'llm.review_link' to match
 *    new reviews to existing guests. High-confidence (>=0.85) auto-links;
 *    medium (0.5-0.85) goes to exception queue; low (<0.5) stays unlinked.
 *
 * What runs where:
 *  - Polling: scheduled tick (cron-like) calls pollAndLink() per property.
 *    For MVP we expose a /v1/reviews/poll POST endpoint so an external
 *    scheduler (k8s CronJob, GitHub Actions, or just a manual trigger
 *    during pilot) drives the cadence. Internal cron is V2.
 *  - Linking: same call path — pollAndLink does both.
 *
 * Honest limitations of this implementation:
 *  - Real TripAdvisor / Booking / Google Business adapters are not built —
 *    they require commercial API access (partner programmes, OAuth). The
 *    DirectFeedbackAdapter and FakeAdapter prove the pipeline works; real
 *    adapters slot in by implementing ReviewSource.
 *  - Sentiment analysis and topic extraction are deferred to V2; we record
 *    the review verbatim and link it, but don't extract themes yet.
 */
import { createLogger } from '@roomard/logger';
import type { PoolClient } from 'pg';

const log = createLogger({ name: 'ingest.review' });

const AUTO_LINK_CONFIDENCE = 0.85;
const NEEDS_REVIEW_CONFIDENCE = 0.5;

export interface ExternalReview {
  externalId: string;
  postedAt: string; // ISO datetime
  rating?: number; // 0-10 normalised
  title?: string;
  body: string;
  language?: string;
  authorAlias?: string;
}

/**
 * Wire-level source kind. Matches the `review_source` Postgres enum exactly.
 * 'manual' covers everything captured by direct guest feedback (web form,
 * tablet, email reply, etc.) — we don't have a separate enum value for it.
 */
export type ReviewSource = 'tripadvisor' | 'booking_com' | 'google' | 'manual';

export interface SourceAdapter {
  readonly source: ReviewSource;
  fetchNew(args: {
    propertyId: string;
    since: string; // ISO datetime — only fetch reviews newer than this
  }): Promise<ExternalReview[]>;
}

export interface ReviewLinkerDeps {
  aiInvoke(input: {
    capability: 'llm.review_link';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{ output: unknown; modelId: string; promptVersion?: string }>;
}

export interface PollSummary {
  propertyId: string;
  source: ReviewSource;
  fetched: number;
  newReviews: number;
  duplicates: number;
  linked: number;
  exceptionQueued: number;
  unlinked: number;
  errors: string[];
}

/**
 * Poll a single source for one property, ingest new reviews, and run linking.
 */
export async function pollAndLink(
  client: PoolClient,
  deps: ReviewLinkerDeps,
  args: {
    tenantId: string;
    propertyId: string;
    requestId: string;
    adapter: SourceAdapter;
  },
): Promise<PollSummary> {
  const summary: PollSummary = {
    propertyId: args.propertyId,
    source: args.adapter.source,
    fetched: 0,
    newReviews: 0,
    duplicates: 0,
    linked: 0,
    exceptionQueued: 0,
    unlinked: 0,
    errors: [],
  };

  // 1. Determine "since" from the last successful poll.
  const since = await getLastPolledAt(client, args.propertyId, args.adapter.source);

  // 2. Fetch.
  let externalReviews: ExternalReview[];
  try {
    externalReviews = await args.adapter.fetchNew({ propertyId: args.propertyId, since });
  } catch (err) {
    log.error({ err, propertyId: args.propertyId, source: args.adapter.source }, 'review fetch failed');
    summary.errors.push(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return summary;
  }
  summary.fetched = externalReviews.length;

  // 3. Find the integration_id for this source/tenant — required by the schema.
  const integrationId = await findIntegrationId(client, args.tenantId, args.adapter.source);
  if (!integrationId) {
    summary.errors.push(`no active integration row for source=${args.adapter.source}`);
    return summary;
  }

  // 4. Upsert reviews and link each one.
  for (const ext of externalReviews) {
    const insertResult = await upsertReview(client, {
      tenantId: args.tenantId,
      propertyId: args.propertyId,
      integrationId,
      source: args.adapter.source,
      ext,
    });
    if (insertResult === 'duplicate') {
      summary.duplicates += 1;
      continue;
    }
    summary.newReviews += 1;
    // Run linking for newly-inserted reviews only.
    try {
      const linkResult = await linkReviewToGuest(client, deps, {
        tenantId: args.tenantId,
        propertyId: args.propertyId,
        requestId: args.requestId,
        reviewId: insertResult.reviewId,
        reviewBody: ext.body,
        authorAlias: ext.authorAlias,
        postedAt: ext.postedAt,
      });
      if (linkResult === 'linked') summary.linked += 1;
      else if (linkResult === 'queued') summary.exceptionQueued += 1;
      else summary.unlinked += 1;
    } catch (err) {
      summary.errors.push(`link review ${ext.externalId}: ${err instanceof Error ? err.message : String(err)}`);
      summary.unlinked += 1;
    }
  }

  // 5. Update last_polled_at on the integration row.
  await client.query(
    `UPDATE integrations SET last_polled_at = now(), updated_at = now() WHERE id = $1`,
    [integrationId],
  );

  log.info(
    {
      propertyId: args.propertyId,
      source: args.adapter.source,
      fetched: summary.fetched,
      new: summary.newReviews,
      linked: summary.linked,
      queued: summary.exceptionQueued,
    },
    'review poll complete',
  );

  return summary;
}

async function getLastPolledAt(
  client: PoolClient,
  propertyId: string,
  source: ReviewSource,
): Promise<string> {
  const { rows } = await client.query<{ last_polled_at: Date | null }>(
    `SELECT last_polled_at FROM integrations
     WHERE property_id = $1 AND kind = $2::integration_kind AND status = 'active'
     LIMIT 1`,
    [propertyId, sourceToIntegrationKind(source)],
  );
  if (rows[0]?.last_polled_at) return rows[0].last_polled_at.toISOString();
  // First poll: look back 30 days. Avoids ingesting decade-old reviews on first run.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  return since.toISOString();
}

async function findIntegrationId(
  client: PoolClient,
  tenantId: string,
  source: ReviewSource,
): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM integrations
     WHERE tenant_id = $1::uuid AND kind = $2::integration_kind AND status = 'active'
     LIMIT 1`,
    [tenantId, sourceToIntegrationKind(source)],
  );
  return rows[0]?.id ?? null;
}

function sourceToIntegrationKind(source: ReviewSource): string {
  switch (source) {
    case 'tripadvisor':
      return 'review_tripadvisor';
    case 'booking_com':
      return 'review_booking';
    case 'google':
      return 'review_google';
    case 'manual':
      // No integration row exists for direct feedback — caller handles that
      // case by short-circuiting before calling this function. We return a
      // placeholder that won't match any real row, so findIntegrationId
      // returns null and the poller records an error.
      return 'manual';
  }
}

interface UpsertArgs {
  tenantId: string;
  propertyId: string;
  integrationId: string;
  source: ReviewSource;
  ext: ExternalReview;
}

async function upsertReview(
  client: PoolClient,
  args: UpsertArgs,
): Promise<'duplicate' | { reviewId: string }> {
  // ON CONFLICT on the (tenant_id, source, external_id) unique index.
  const { rows } = await client.query<{ id: string; was_insert: boolean }>(
    `INSERT INTO reviews (
       id, tenant_id, property_id, integration_id,
       source, external_id, reviewer_name, rating, title, body, language, posted_at
     ) VALUES (
       gen_random_uuid(),
       current_setting('app.tenant_id', false)::uuid,
       $1, $2, $3::review_source, $4, $5, $6, $7, $8, $9, $10
     )
     ON CONFLICT (tenant_id, source, external_id) DO NOTHING
     RETURNING id, true AS was_insert`,
    [
      args.propertyId,
      args.integrationId,
      args.source,
      args.ext.externalId,
      args.ext.authorAlias ?? null,
      args.ext.rating ?? null,
      args.ext.title ?? null,
      args.ext.body,
      args.ext.language ?? null,
      args.ext.postedAt,
    ],
  );
  if (rows.length === 0) return 'duplicate';
  return { reviewId: rows[0]!.id };
}

export interface LinkResult {
  linkedGuestId: string | null;
  confidence: number;
  reasons: string[];
}

async function linkReviewToGuest(
  client: PoolClient,
  deps: ReviewLinkerDeps,
  args: {
    tenantId: string;
    propertyId: string;
    requestId: string;
    reviewId: string;
    reviewBody: string;
    authorAlias?: string;
    postedAt: string;
  },
): Promise<'linked' | 'queued' | 'unlinked'> {
  // 1. Find candidate guests — those who stayed at this property within
  //    +/- 30 days of the review's postedAt, who might be the reviewer.
  const { rows: candidates } = await client.query<{
    guest_id: string;
    display_name: string;
    arrival_at: Date;
    departure_at: Date;
  }>(
    `SELECT s.guest_id, g.display_name, s.arrival_at, s.departure_at
     FROM stays s
     JOIN guests g ON g.id = s.guest_id
     WHERE s.property_id = $1
       AND s.departure_at BETWEEN $2::timestamptz - interval '30 days'
                              AND $2::timestamptz + interval '30 days'
     ORDER BY s.departure_at DESC
     LIMIT 50`,
    [args.propertyId, args.postedAt],
  );

  if (candidates.length === 0) {
    await client.query(
      `UPDATE reviews SET link_status = 'unlinked' WHERE id = $1`,
      [args.reviewId],
    );
    return 'unlinked';
  }

  // 2. Ask the AI.
  const aiPayload = {
    reviewBody: args.reviewBody,
    authorAlias: args.authorAlias,
    postedAt: args.postedAt,
    candidates: candidates.map((c) => ({
      guestId: c.guest_id,
      displayName: c.display_name,
      stayDates: `${c.arrival_at.toISOString().slice(0, 10)} → ${c.departure_at.toISOString().slice(0, 10)}`,
    })),
  };

  const result = await deps.aiInvoke({
    capability: 'llm.review_link',
    tenantId: args.tenantId,
    requestId: args.requestId,
    payload: aiPayload,
  });

  const linkResult = parseLinkResult(result.output);

  // 3. Apply by confidence band.
  if (linkResult.linkedGuestId && linkResult.confidence >= AUTO_LINK_CONFIDENCE) {
    await client.query(
      `UPDATE reviews SET
         linked_guest_id = $1,
         link_confidence = $2,
         link_status = 'auto_linked'::review_link_status,
         linked_at = now()
       WHERE id = $3`,
      [linkResult.linkedGuestId, linkResult.confidence, args.reviewId],
    );
    return 'linked';
  }

  if (linkResult.confidence >= NEEDS_REVIEW_CONFIDENCE) {
    // Medium confidence — propose to human in exception queue.
    await client.query(
      `UPDATE reviews SET
         link_confidence = $1,
         link_status = 'unlinked'::review_link_status
       WHERE id = $2`,
      [linkResult.confidence, args.reviewId],
    );
    await client.query(
      `INSERT INTO exception_queue_items (
         id, tenant_id, property_id, kind, status, severity,
         title, description, payload, guest_id
       ) VALUES (
         gen_random_uuid(),
         current_setting('app.tenant_id', false)::uuid,
         $1, 'review_link_ambiguous'::exception_kind, 'open'::exception_status, 3,
         'Review link needs human review',
         $2, $3::jsonb, $4
       )`,
      [
        args.propertyId,
        `Confidence ${(linkResult.confidence * 100).toFixed(0)}% — suggested guest ${linkResult.linkedGuestId ?? '(none)'}`,
        JSON.stringify({ reviewId: args.reviewId, suggestion: linkResult, candidates }),
        linkResult.linkedGuestId,
      ],
    );
    return 'queued';
  }

  // Low confidence — leave unlinked, no exception (nothing actionable).
  await client.query(
    `UPDATE reviews SET link_status = 'unlinked'::review_link_status, link_confidence = $1 WHERE id = $2`,
    [linkResult.confidence, args.reviewId],
  );
  return 'unlinked';
}

function parseLinkResult(output: unknown): LinkResult {
  if (typeof output !== 'object' || output === null) {
    return { linkedGuestId: null, confidence: 0, reasons: [] };
  }
  let obj = output as Record<string, unknown>;
  // Real Qianfan may return {rawText: "..."} if JSON parse failed in provider.
  if (typeof obj.rawText === 'string') {
    try {
      obj = JSON.parse(obj.rawText) as Record<string, unknown>;
    } catch {
      return { linkedGuestId: null, confidence: 0, reasons: [String(obj.rawText)] };
    }
  }
  return {
    linkedGuestId: typeof obj.linkedGuestId === 'string' ? obj.linkedGuestId : null,
    confidence: typeof obj.confidence === 'number' ? obj.confidence : 0,
    reasons: Array.isArray(obj.reasons) ? obj.reasons.map(String) : [],
  };
}

// ===========================================================================
// Source adapters
// ===========================================================================

/**
 * Direct feedback adapter — reads from a `direct_feedback_intake` table where
 * properties drop reviews captured at the desk (web form, in-room tablet).
 * This is the only adapter we can ship without external API credentials.
 *
 * Stores reviews with source='manual' in the reviews table (per schema enum).
 *
 * NOTE: This adapter needs a special integration row of kind='manual' (or
 * we relax the integration_id NOT NULL constraint in a future migration).
 * For pilot use, ops should create one `integrations` row per property with
 * kind='manual', status='active'. See runbook.
 */
export class DirectFeedbackAdapter implements SourceAdapter {
  readonly source: ReviewSource = 'manual';

  constructor(private readonly client: { query: PoolClient['query'] }) {}

  async fetchNew(args: { propertyId: string; since: string }): Promise<ExternalReview[]> {
    const { rows } = await this.client.query<{
      id: string;
      submitted_at: Date;
      rating: number | null;
      body: string;
      author_name: string | null;
    }>(
      `SELECT id, submitted_at, rating, body, author_name
       FROM direct_feedback_intake
       WHERE property_id = $1 AND submitted_at > $2 AND processed_at IS NULL
       ORDER BY submitted_at ASC
       LIMIT 200`,
      [args.propertyId, args.since],
    );
    return rows.map((r) => ({
      externalId: r.id,
      postedAt: r.submitted_at.toISOString(),
      rating: r.rating ?? undefined,
      body: r.body,
      authorAlias: r.author_name ?? undefined,
    }));
  }
}

/**
 * Stub adapters for TripAdvisor / Booking / Google. These exist as scaffolding —
 * they return empty arrays until real API integration is wired. This lets us
 * test the surrounding pipeline end-to-end without commercial API access.
 *
 * To replace one of these with a real adapter:
 *  1. Implement `fetchNew` against the real API (rate limits, auth, paging)
 *  2. Normalise the response into ExternalReview
 *  3. Register the new adapter in the poll route below
 */
export class StubTripAdvisorAdapter implements SourceAdapter {
  readonly source: ReviewSource = 'tripadvisor';
  async fetchNew(): Promise<ExternalReview[]> {
    log.warn('TripAdvisor adapter is a stub — no real API integration yet');
    return [];
  }
}

export class StubBookingAdapter implements SourceAdapter {
  readonly source: ReviewSource = 'booking_com';
  async fetchNew(): Promise<ExternalReview[]> {
    log.warn('Booking.com adapter is a stub — no real API integration yet');
    return [];
  }
}

export class StubGoogleAdapter implements SourceAdapter {
  readonly source: ReviewSource = 'google';
  async fetchNew(): Promise<ExternalReview[]> {
    log.warn('Google Business adapter is a stub — no real API integration yet');
    return [];
  }
}
