/**
 * Audit query, hash-chain verification, and export-pack generation.
 *
 * Hash chain (per migration 0011): each row's `hash` = sha256(
 *   id || occurred_at || tenant_id || actor_kind || actor_id || operation ||
 *   resource_type || resource_id || data_class || payload_hash || previous_hash
 * ). The chain is per-tenant: `previous_hash` is the last row's hash for
 * the same tenant. Verification re-hashes each row and asserts the chain.
 */
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';

export interface AuditRow {
  id: string;
  occurred_at: Date;
  tenant_id: string | null;
  actor_kind: string;
  actor_id: string | null;
  actor_label: string | null;
  operation: string;
  resource_type: string;
  resource_id: string | null;
  request_id: string | null;
  ip_inet: string | null;
  user_agent: string | null;
  data_class: string;
  payload_hash: string;
  previous_hash: string | null;
  hash: string;
}

export function computeHash(row: AuditRow): string {
  const canonical = [
    row.id,
    row.occurred_at.toISOString(),
    row.tenant_id ?? '',
    row.actor_kind,
    row.actor_id ?? '',
    row.operation,
    row.resource_type,
    row.resource_id ?? '',
    row.data_class,
    row.payload_hash,
    row.previous_hash ?? '',
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
  const { rows } = await client.query<AuditRow>(
    `SELECT * FROM audit_events
     WHERE tenant_id = $1::uuid AND occurred_at >= $2 AND occurred_at <= $3
     ORDER BY occurred_at ASC, id ASC`,
    [tenantId, from, to],
  );

  // We also need the row just before `from` so we can verify the first row's previous_hash.
  let priorHash: string | null = null;
  const { rows: priorRows } = await client.query<{ hash: string }>(
    `SELECT hash FROM audit_events
     WHERE tenant_id = $1::uuid AND occurred_at < $2
     ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    [tenantId, from],
  );
  if (priorRows.length > 0) priorHash = priorRows[0]!.hash;

  for (const row of rows) {
    const expectedHash = computeHash(row);
    if (row.hash !== expectedHash) {
      return {
        ok: false,
        rowsChecked: rows.length,
        brokenAtRowId: row.id,
        reason: 'hash mismatch — row content has been tampered with or hash recomputation failed',
      };
    }
    if (row.previous_hash !== priorHash) {
      return {
        ok: false,
        rowsChecked: rows.length,
        brokenAtRowId: row.id,
        reason: 'previous_hash does not link to prior row — chain broken',
      };
    }
    priorHash = row.hash;
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
    where.push(`resource_type = $${i}`);
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
