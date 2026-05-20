/**
 * Tenant context — sets the per-transaction Postgres GUC variables that drive RLS
 * (`app.tenant_id`) and audit triggers (`app.user_id`, `app.actor_kind`, `app.request_id`,
 * `app.ip_inet`, `app.user_agent`).
 *
 * Every request handler that reads or writes tenant data MUST wrap its DB work in
 * `withTenantContext(...)`. There is no implicit tenant. Forgetting to set it returns
 * zero rows (RLS rejects) or fails-closed on writes.
 *
 * Usage:
 *
 *   await withTenantContext(pool, {
 *     tenantId: ctx.tenantId,
 *     userId: ctx.userId,
 *     actorKind: 'user',
 *     requestId: ctx.requestId,
 *   }, async (client) => {
 *     const result = await client.query('SELECT id, display_name FROM guests LIMIT 10');
 *     return result.rows;
 *   });
 */
import { DatabaseError } from '@roomard/errors';
import type { PoolClient } from 'pg';


import type { RoomardPool } from './pool.js';

export type ActorKind = 'user' | 'system' | 'integration' | 'ai';

export interface TenantContext {
  /** Tenant UUID. Required. */
  tenantId: string;
  /** Acting user UUID. Omit for system-initiated work; set actorKind to 'system'. */
  userId?: string | null;
  actorKind?: ActorKind;
  /**
   * Human-readable label for non-user actors. Examples: 'mews-webhook',
   * 'ai-brief-job', 'cron-poller'. Not currently persisted to GUC (no DB column yet);
   * carried for logging/metrics today, audit table will pick it up in a future
   * migration that adds an `actor_label` column on `audit_events`.
   */
  actorLabel?: string;
  requestId?: string | null;
  ipInet?: string | null;
  userAgent?: string | null;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SAFE_AGENT_RE = /[^\x20-\x7E]/g; // strip non-printable

/**
 * Run the callback inside a transaction with tenant context set.
 *
 * Always uses BEGIN ... COMMIT/ROLLBACK and SET LOCAL so the GUCs are released at
 * transaction end and never leak to a recycled pool client.
 */
export async function withTenantContext<T>(
  pool: RoomardPool,
  ctx: TenantContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.tenantId, 'tenantId');
  if (ctx.userId !== undefined && ctx.userId !== null) {
    assertUuid(ctx.userId, 'userId');
  }
  if (ctx.requestId !== undefined && ctx.requestId !== null) {
    assertUuid(ctx.requestId, 'requestId');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyContext(client, ctx);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // swallow rollback failure — pool client will be discarded
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Variant for read-only work that does not need an explicit transaction.
 * Postgres still sets the GUCs on the session for the duration we hold the client.
 *
 * Useful for endpoints that issue several reads but no writes; saves the BEGIN/COMMIT
 * overhead at the cost of slightly weaker GUC scoping. The GUCs are reset before the
 * client is returned to the pool.
 */
export async function withReadOnlyTenantContext<T>(
  pool: RoomardPool,
  ctx: TenantContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.tenantId, 'tenantId');
  const client = await pool.connect();
  try {
    await applyContext(client, ctx, /* useLocal */ false);
    return await fn(client);
  } finally {
    // Best-effort cleanup; if it fails the client will be discarded on next error.
    await client
      .query("SELECT set_config('app.tenant_id', '', false), " +
             "set_config('app.user_id', '', false), " +
             "set_config('app.actor_kind', '', false), " +
             "set_config('app.request_id', '', false), " +
             "set_config('app.ip_inet', '', false), " +
             "set_config('app.user_agent', '', false)")
      .catch(() => undefined);
    client.release();
  }
}

async function applyContext(
  client: PoolClient,
  ctx: TenantContext,
  useLocal = true,
): Promise<void> {
  // G-35: Postgres SET / SET LOCAL does NOT accept bind parameters ($1) — it only
  // takes literals, so `SET LOCAL app.tenant_id = $1` throws `syntax error at or
  // near "$1"` against a real server. (This stayed latent because unit tests use a
  // fake pool that never parses the SET syntax.) Use set_config(name, value, is_local)
  // — the function form that DOES accept parameters and is injection-safe. is_local
  // = useLocal mirrors SET LOCAL (transaction-scoped) vs SET (session-scoped).
  const isLocal = useLocal;
  await client.query('SELECT set_config($1, $2, $3)', ['app.tenant_id', ctx.tenantId, isLocal]);
  await client.query('SELECT set_config($1, $2, $3)', [
    'app.actor_kind',
    ctx.actorKind ?? (ctx.userId ? 'user' : 'system'),
    isLocal,
  ]);
  await client.query('SELECT set_config($1, $2, $3)', ['app.user_id', ctx.userId ?? '', isLocal]);
  if (ctx.requestId) {
    await client.query('SELECT set_config($1, $2, $3)', ['app.request_id', ctx.requestId, isLocal]);
  }
  if (ctx.ipInet) {
    // Validated inet — Postgres will fail closed if malformed.
    await client.query('SELECT set_config($1, $2, $3)', ['app.ip_inet', ctx.ipInet, isLocal]);
  }
  if (ctx.userAgent) {
    const safe = ctx.userAgent.replace(SAFE_AGENT_RE, '').slice(0, 512);
    await client.query('SELECT set_config($1, $2, $3)', ['app.user_agent', safe, isLocal]);
  }
}

function assertUuid(value: string, fieldName: string): void {
  if (!UUID_RE.test(value)) {
    throw new DatabaseError(`${fieldName} must be a UUID`);
  }
}
