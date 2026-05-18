/**
 * Postgres connection pool for Roomard services.
 *
 * Each service constructs one pool at boot via createPool(). The pool is shared across
 * all requests. Per-request tenant context is set via withTenantContext() which
 * acquires a client, sets the session-local app.tenant_id, runs the callback, and
 * releases the client.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import type { PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import pg from 'pg';

import { DatabaseError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';

const { Pool } = pg;

const log = createLogger({ name: 'db' });

/**
 * Configuration that callers pass in. We deliberately keep this independent of process.env
 * so the pool is testable.
 */
export interface DbConfig {
  /** Postgres connection string (postgres://...) */
  connectionString: string;
  /** Maximum pool size. Default 10. */
  poolMax?: number;
  /** Minimum pool size. Default 2. */
  poolMin?: number;
  /** statement_timeout in milliseconds; applied per connection. */
  statementTimeoutMs?: number;
  /** SSL TLS settings. */
  ssl?: PoolConfig['ssl'];
  /** Application name reported to Postgres. */
  applicationName?: string;
}

/**
 * Read DB config from environment variables.
 * Throws if required settings are missing.
 */
export function dbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseError('DATABASE_URL is required');
  }
  return {
    connectionString,
    poolMax: parseIntOr(env.DATABASE_POOL_MAX, 10),
    poolMin: parseIntOr(env.DATABASE_POOL_MIN, 2),
    statementTimeoutMs: parseIntOr(env.DATABASE_STATEMENT_TIMEOUT_MS, 30000),
    ssl: parseSsl(env),
    applicationName: env.APP_NAME ?? 'roomard',
  };
}

function parseIntOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new DatabaseError(`Invalid integer env value: ${value}`);
  }
  return parsed;
}

function parseSsl(env: NodeJS.ProcessEnv): PoolConfig['ssl'] {
  if (env.DATABASE_SSL === 'false' || env.DATABASE_SSL === undefined) return undefined;
  if (env.DATABASE_SSL_CA_PATH) {
    return {
      ca: readFileSync(env.DATABASE_SSL_CA_PATH, 'utf8'),
      rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }
  return { rejectUnauthorized: false };
}

/**
 * Construct the pool. Returns a wrapper object so we can attach helpers and ensure
 * statement_timeout is set per connection.
 */
export function createPool(config: DbConfig): RoomardPool {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.poolMax ?? 10,
    min: config.poolMin ?? 2,
    application_name: config.applicationName ?? 'roomard',
    ssl: config.ssl,
    // Postgres applies statement_timeout per session; we set it on connect below.
  });

  pool.on('connect', (client) => {
    if (config.statementTimeoutMs) {
      // Best-effort: failure here is logged but does not block the connection.
      client
        .query(`SET statement_timeout = ${Number(config.statementTimeoutMs)}`)
        .catch((err) => log.warn({ err }, 'failed to set statement_timeout'));
    }
  });

  pool.on('error', (err) => {
    log.error({ err }, 'unexpected pool error');
  });

  return new RoomardPool(pool);
}

/**
 * RoomardPool wraps the pg Pool with tenant-aware helpers and instrumentation.
 */
export class RoomardPool {
  private closed = false;

  constructor(private readonly pool: pg.Pool) {}

  /** Direct query — only for migrations / ops scripts. App code should use withTenantContext. */
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>> {
    this.assertOpen();
    const start = performance.now();
    try {
      return await this.pool.query<T>(text, values as unknown[] | undefined);
    } finally {
      const duration = performance.now() - start;
      if (duration > 500) {
        log.warn({ duration_ms: Math.round(duration), text }, 'slow query');
      }
    }
  }

  /** Acquire a client for transactional work. The caller MUST release it. */
  async connect(): Promise<PoolClient> {
    this.assertOpen();
    return this.pool.connect();
  }

  /** Pool stats for health endpoints. */
  stats(): { total: number; idle: number; waiting: number } {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  /** Graceful shutdown. Drains the pool. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new DatabaseError('pool is closed');
    }
  }

  /** Internal access for tenant-context helpers. */
  get raw(): pg.Pool {
    return this.pool;
  }
}
