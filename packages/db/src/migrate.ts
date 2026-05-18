/**
 * Migration runner.
 *
 * Scans `migrations/` for files matching `NNNN_*.sql` and applies them in lexical order
 * to a target database. The applied set is tracked in a `_migrations` table.
 *
 * Down migrations are paired as `NNNN_*.down.sql` and only invoked via the CLI.
 *
 * Implementation notes:
 * - Uses a single connection (not a pool) to ensure migrations run sequentially.
 * - Each migration runs inside its own transaction (the SQL files include BEGIN/COMMIT).
 *   If a migration omits BEGIN/COMMIT the runner wraps it.
 * - The applied table records filename, checksum, applied_at. Rerunning a changed
 *   migration is refused — migrations are immutable once applied.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import pg from 'pg';

import { DatabaseError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';

const { Client } = pg;
const log = createLogger({ name: 'db.migrate' });

const MIGRATIONS_TABLE = '_migrations';
const MIGRATION_FILE_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const DOWN_FILE_RE = /^(\d{4})_([a-z0-9_]+)\.down\.sql$/;

export interface MigrationOptions {
  connectionString: string;
  migrationsDir: string;
}

export interface MigrationRecord {
  id: string;
  filename: string;
  checksum: string;
  applied_at: Date;
}

interface MigrationFile {
  filename: string;
  id: string;
  name: string;
  sql: string;
  checksum: string;
}

function readMigrations(dir: string, kind: 'up' | 'down'): MigrationFile[] {
  const re = kind === 'up' ? MIGRATION_FILE_RE : DOWN_FILE_RE;
  const all = readdirSync(dir).filter((f) => re.test(f));
  // For up, exclude down files which also match MIGRATION_FILE_RE-ish patterns.
  const filtered = kind === 'up' ? all.filter((f) => !f.endsWith('.down.sql')) : all;
  filtered.sort();

  return filtered.map((filename) => {
    const match = re.exec(filename);
    if (!match) throw new DatabaseError(`unexpected migration filename: ${filename}`);
    const sql = readFileSync(join(dir, filename), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return {
      filename,
      id: match[1] ?? '0000',
      name: match[2] ?? 'unknown',
      sql,
      checksum,
    };
  });
}

async function ensureMigrationsTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id          TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(client: pg.Client): Promise<Map<string, MigrationRecord>> {
  const result = await client.query<MigrationRecord>(
    `SELECT id, filename, checksum, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id`,
  );
  return new Map(result.rows.map((r) => [r.id, r]));
}

export async function migrateUp(opts: MigrationOptions): Promise<{ applied: string[] }> {
  const client = new Client({ connectionString: opts.connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    await ensureMigrationsTable(client);
    const knownMap = await appliedMigrations(client);
    const files = readMigrations(resolve(opts.migrationsDir), 'up');

    for (const file of files) {
      const known = knownMap.get(file.id);
      if (known) {
        if (known.checksum !== file.checksum) {
          throw new DatabaseError(
            `migration ${file.filename} has changed after application — refusing to apply. ` +
              `Create a new migration instead.`,
          );
        }
        continue;
      }

      log.info({ filename: file.filename }, 'applying migration');
      // If the migration file contains its own BEGIN/COMMIT (recommended), this still works:
      // a nested transaction-less query simply executes within the file's transaction.
      // Otherwise we wrap the whole thing.
      const wrap = !/\bBEGIN\b/i.test(file.sql);
      if (wrap) await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query(
          `INSERT INTO ${MIGRATIONS_TABLE}(id, filename, checksum) VALUES($1,$2,$3)`,
          [file.id, file.filename, file.checksum],
        );
        if (wrap) await client.query('COMMIT');
      } catch (err) {
        if (wrap) await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
      applied.push(file.filename);
    }
  } finally {
    await client.end();
  }
  return { applied };
}

export async function migrateDown(
  opts: MigrationOptions,
  steps = 1,
): Promise<{ rolledBack: string[] }> {
  const client = new Client({ connectionString: opts.connectionString });
  await client.connect();
  const rolledBack: string[] = [];
  try {
    await ensureMigrationsTable(client);
    const knownMap = await appliedMigrations(client);
    const downFiles = readMigrations(resolve(opts.migrationsDir), 'down');
    const ordered = Array.from(knownMap.values()).sort((a, b) => b.id.localeCompare(a.id));

    for (let i = 0; i < steps && i < ordered.length; i++) {
      const target = ordered[i];
      if (!target) break;
      const downFile = downFiles.find((d) => d.id === target.id);
      if (!downFile) {
        throw new DatabaseError(
          `cannot roll back ${target.filename} — no matching .down.sql file`,
        );
      }
      log.info({ filename: downFile.filename }, 'rolling back migration');
      await client.query('BEGIN');
      try {
        await client.query(downFile.sql);
        await client.query(`DELETE FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [target.id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
      rolledBack.push(downFile.filename);
    }
  } finally {
    await client.end();
  }
  return { rolledBack };
}

/**
 * Reset: drop the public schema and re-apply all migrations. DESTRUCTIVE.
 * Intended for local dev and CI test setup only. Refuses to run if DATABASE_URL
 * looks like production (host !== localhost AND db !== *_test).
 */
export async function migrateReset(opts: MigrationOptions): Promise<void> {
  assertNotProduction(opts.connectionString);
  const client = new Client({ connectionString: opts.connectionString });
  await client.connect();
  try {
    log.warn('resetting database — dropping public schema');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
  } finally {
    await client.end();
  }
  await migrateUp(opts);
}

function assertNotProduction(connectionString: string): void {
  const url = new URL(connectionString);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const isTestDb = /_test$|^roomard_test$/.test(url.pathname.replace(/^\//, ''));
  if (!isLocal && !isTestDb) {
    throw new DatabaseError(
      'migrateReset refused: connection string does not look like local or test DB',
    );
  }
}
