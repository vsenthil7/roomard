#!/usr/bin/env node
/**
 * roomard-db migrate CLI.
 *
 *   tsx src/cli/migrate.ts up         # apply pending migrations
 *   tsx src/cli/migrate.ts down [n]   # roll back n migrations (default 1)
 *   tsx src/cli/migrate.ts reset      # destructive reset (local/test only)
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger } from '@roomard/logger';

import { migrateDown, migrateReset, migrateUp } from '../migrate.js';

const log = createLogger({ name: 'db.cli.migrate' });

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'up';

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, '../../migrations');

  switch (command) {
    case 'up': {
      const { applied } = await migrateUp({ connectionString, migrationsDir });
      if (applied.length === 0) {
        log.info('no pending migrations');
      } else {
        log.info({ count: applied.length, files: applied }, 'migrations applied');
      }
      break;
    }
    case 'down': {
      const steps = Number.parseInt(args[1] ?? '1', 10);
      const { rolledBack } = await migrateDown({ connectionString, migrationsDir }, steps);
      log.info({ rolledBack }, 'rolled back');
      break;
    }
    case 'reset': {
      await migrateReset({ connectionString, migrationsDir });
      log.warn('database reset complete');
      break;
    }
    default:
      console.error(`unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  log.error({ err }, 'migration failed');
  process.exit(1);
});
