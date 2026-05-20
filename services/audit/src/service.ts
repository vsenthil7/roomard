/**
 * Audit query, hash-chain verification, and export-pack generation.
 *
 * G-37 — this module was written against an IMAGINED audit_events schema
 * (`hash`, `resource_type`, `payload_hash`, `actor_label`). The REAL columns
 * (migration 0011) are `event_hash` (bytea), `resource_kind`, `actor_display`,
 * `detail` (jsonb) — and there is no `payload_hash`. The drift made the query
 * and verify endpoints throw `column "..." does not exist` against real Postgres.
 * Aligned below.
 *
 * Hash chain (migration 0011 `audit_compute_hash` trigger): per-tenant,
 *   event_hash = digest(concat_ws('|',
 *     id, tenant_id, actor_kind, actor_id(''), operation, resource_kind,
 *     resource_id(''), data_class(''), occurred_at::text,
 *     encode(previous_hash, 'hex')('')
 *   ), 'sha256')
 * stored as bytea. Crucially the trigger uses Postgres `occurred_at::text` and
 * `concat_ws`, so re-deriving the hash in JS would have to byte-match Postgres's
 * timestamp rendering — brittle. `verifyChain` therefore re-derives the hash
 * IN SQL using the identical expression and compares to the stored event_hash,
 * which is exact by construction.
 */
import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

export interface AuditRow {
  id: string;
  occurred_at: Date;
  tenant_id: string | null;
  actor_kind: string;
  actor_id: string | null;
  actor_display: string | null;
  operation: string;
  resource_kind: string;
  resource_id: string | null;
  request_id: string | null;
  ip_inet: string | null;
  user_agent: string | null;
  data_class: string | null;
  detail: unknown;
  previous_hash: Buffer | null;
  event_hash: Buffer;
}

/**
 * Re-derive an audit row's hash hex digest using the SAME canonical recipe as the
 * migration-0011 trigger. `occurredAtText` MUST be Postgres's `occurred_at::text`
 * rendering (not JS toISOString) for the digest to match the stored event_hash;
 * pass the value selected as `occurred_at::text` from Postgres. `prevHashHex` is
 * the hex encoding of the previous row's event_hash, or '' for the chain head.
 */
export function computeHash(
  row: Pick<
    AuditRow,
    'id' | 'tenant_id' | 'actor_kind' | 'actor_id' | 'operation' | 'resource_kind' | 'resource_id' | 'data_class'
  >,
  occurredAtText: string,
  prevHashHex: string,
): string {
  const canonical = [
    row.id,
    row.tenant_id ?? '',
    row.actor_kind,
    row.actor_id ?? '',
    row.operation,
    row.resource_kind,
    row.resource_id ?? '',
    row.data_class ?? '',
    occurredAtText,
    prevHashHex,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

export interface VerifyResult {
  ok: boolean;
  rowsChecked: number;
  brokenAtRowId: string | null;
  reason: string | null;
}

/**
 * Verify the audit chain for a tenant from `from` (inclusive) to `to` (inclusive).
 * Returns { ok: true, ... } when every row's hash recomputes and previous_hash links
 * the prior row's hash.
 */
export async function verifyChain(
  client: PoolClient,
  tenantId: string,
  from: string,
  to: string,
): Promise<VerifyResult> {
  // Re-derive each row's hash IN SQL with the exact migration-0011 recipe and
  // compare to the stored event_hash. Also check that previous_hash links the
  // immediately-preceding row in the per-tenant order. Doing this in SQL avoids
  // having to reproduce Postgres's `occurred_at::text` rendering in JS.
  //
  // `recomputed` mirrors audit_compute_hash: digest(concat_ws('|', ...,
  //   occurred_at::text, encode(previous_hash,'hex')), 'sha256'). `expected_prev`
  // is the prior row's event_hash via LAG over the per-tenant ordering.
  const { rows } = await client.query<{
    id: string;
    hash_ok: boolean;
    link_ok: boolean;
  }>(
    `WITH ordered AS (
       SELECT
         id, tenant_id, occurred_at, previous_hash, event_hash,
         LAG(event_hash) OVER (PARTITION BY tenant_id ORDER BY occurred_at ASC, id ASC) AS expected_prev,
         digest(
           concat_ws('|',
             id::text, tenant_id::text, actor_kind::text,
             COALESCE(actor_id::text, ''), operation::text, resource_kind,
             COALESCE(resource_id::text, ''), COALESCE(data_class::text, ''),
             occurred_at::text,
             encode(
               COALESCE(
                 LAG(event_hash) OVER (PARTITION BY tenant_id ORDER BY occurred_at ASC, id ASC),
                 ''::bytea
               ),
               'hex'
             )
           ),
           'sha256'
         ) AS recomputed
       FROM audit_events
       WHERE tenant_id = $1::uuid
     )
     SELECT
       id,
       (event_hash = recomputed) AS hash_ok,
       (previous_hash IS NOT DISTINCT FROM expected_prev) AS link_ok
     FROM ordered
     WHERE occurred_at >= $2 AND occurred_at <= $3
     ORDER BY occurred_at ASC, id ASC`,
    [tenantId, from, to],
  );

  for (const row of rows) {
    if (!row.hash_ok) {
      return {
        ok: false,
        rowsChecked: rows.length,
        brokenAtRowId: row.id,
        reason: 'hash mismatch — row content has been tampered with',
      };
    }
    if (!row.link_ok) {
      return {
        ok: false,
        rowsChecked: rows.length,
        brokenAtRowId: row.id,
        reason: 'previous_hash does not link to prior row — chain broken',
      };
    }
  }

  return { ok: true, rowsChecked: rows.length, brokenAtRowId: null, reason: null };
}

export interface AuditQuery {
  from?: string;
  to?: string;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  operation?: string;
  limit: number;
  cursor?: string;
}

export async function queryEvents(
  client: PoolClient,
  q: AuditQuery,
): Promise<{ items: AuditRow[]; nextCursor: string | null; hasMore: boolean }> {
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q.from) {
    where.push(`occurred_at >= $${i}`);
    params.push(q.from);
    i += 1;
  }
  if (q.to) {
    where.push(`occurred_at <= $${i}`);
    params.push(q.to);
    i += 1;
  }
  if (q.resourceType) {
    where.push(`resource_kind = $${i}`);
    params.push(q.resourceType);
    i += 1;
  }
  if (q.resourceId) {
    where.push(`resource_id = $${i}`);
    params.push(q.resourceId);
    i += 1;
  }
  if (q.actorId) {
    where.push(`actor_id = $${i}::uuid`);
    params.push(q.actorId);
    i += 1;
  }
  if (q.operation) {
    where.push(`operation = $${i}::audit_operation`);
    params.push(q.operation);
    i += 1;
  }
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    if (c) {
      where.push(`(occurred_at, id) < ($${i}, $${i + 1})`);
      params.push(c.occurredAt, c.id);
      i += 2;
    }
  }
  params.push(q.limit + 1);
  const { rows } = await client.query<AuditRow>(
    `SELECT * FROM audit_events
     ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY occurred_at DESC, id DESC LIMIT $${i}`,
    params,
  );
  const hasMore = rows.length > q.limit;
  const slice = rows.slice(0, q.limit);
  const last = slice.at(-1);
  return {
    items: slice,
    nextCursor:
      hasMore && last
        ? encodeCursor({ occurredAt: last.occurred_at.toISOString(), id: last.id })
        : null,
    hasMore,
  };
}

function encodeCursor(input: { occurredAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { occurredAt: string; id: string } | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
