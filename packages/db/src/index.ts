/**
 * @roomard/db — Database access layer.
 *
 * Exports:
 * - createPool, RoomardPool, dbConfigFromEnv — connection pool
 * - withTenantContext, withReadOnlyTenantContext, TenantContext — RLS-aware transaction wrappers
 * - migrateUp, migrateDown, migrateReset — migration runner
 */
export { createPool, dbConfigFromEnv, RoomardPool } from './pool.js';
export type { DbConfig } from './pool.js';

export {
  withTenantContext,
  withReadOnlyTenantContext,
} from './tenant-context.js';
export type { TenantContext, ActorKind } from './tenant-context.js';

export { migrateUp, migrateDown, migrateReset } from './migrate.js';
export type { MigrationOptions, MigrationRecord } from './migrate.js';
