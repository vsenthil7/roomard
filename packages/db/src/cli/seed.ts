#!/usr/bin/env node
/**
 * roomard-db seed CLI.
 *
 * Creates one development tenant with:
 * - One property (Roomard Demo Hotel, London)
 * - Three users (admin, front_desk_manager, front_desk_agent) with known passwords
 * - System roles seeded
 * - A handful of guests, stays, preferences for demos
 *
 * Run after migrateReset; safe to re-run (idempotent on slug).
 */
import { randomUUID } from 'node:crypto';

import { createLogger } from '@roomard/logger';
import bcrypt from 'bcryptjs';


import { createPool, dbConfigFromEnv } from '../pool.js';

const log = createLogger({ name: 'db.cli.seed' });

// Stable UUIDs for the demo tenant so dev tooling and tests can reference them.
const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_PROPERTY_ID = '00000000-0000-4000-8000-000000000010';
const ROLE_ADMIN_ID = '00000000-0000-4000-8000-000000000100';
const ROLE_FRONT_DESK_MGR_ID = '00000000-0000-4000-8000-000000000101';
const ROLE_FRONT_DESK_AGENT_ID = '00000000-0000-4000-8000-000000000102';
const ROLE_CONCIERGE_ID = '00000000-0000-4000-8000-000000000103';
const ROLE_GM_ID = '00000000-0000-4000-8000-000000000104';
const ROLE_DPO_ID = '00000000-0000-4000-8000-000000000105';

const USER_ADMIN_ID = '00000000-0000-4000-8000-000000000200';
const USER_FRONT_DESK_MGR_ID = '00000000-0000-4000-8000-000000000201';
const USER_FRONT_DESK_AGENT_ID = '00000000-0000-4000-8000-000000000202';

async function main(): Promise<void> {
  const pool = createPool(dbConfigFromEnv());
  try {
    await pool.query("SET app.tenant_id = ''"); // explicit none for system inserts

    // Tenant
    await pool.query(
      `INSERT INTO tenants(id, name, slug, tier, data_residency, status, contract_start_at)
       VALUES ($1, $2, $3, 'group', 'eu', 'active', now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [DEMO_TENANT_ID, 'Roomard Demo Hotels', 'demo'],
    );

    // System roles per tenant
    const roleSpec = [
      [ROLE_ADMIN_ID, 'admin', 'Admin', { all: ['*'] }, ['A', 'B', 'C', 'D']],
      [
        ROLE_FRONT_DESK_MGR_ID,
        'front_desk_manager',
        'Front Desk Manager',
        {
          guests: ['read', 'write'],
          preferences: ['read', 'write'],
          briefs: ['read', 'annotate'],
          captures: ['read', 'write'],
          exceptions: ['read', 'resolve'],
        },
        ['A', 'B', 'C'],
      ],
      [
        ROLE_FRONT_DESK_AGENT_ID,
        'front_desk_agent',
        'Front Desk Agent',
        {
          guests: ['read'],
          preferences: ['read', 'write'],
          briefs: ['read'],
          captures: ['read', 'write'],
        },
        ['A', 'B', 'C'],
      ],
      [
        ROLE_CONCIERGE_ID,
        'concierge',
        'Concierge',
        {
          guests: ['read'],
          preferences: ['read'],
          reviews: ['read', 'link'],
          briefs: ['read'],
        },
        ['A', 'B', 'C'],
      ],
      [
        ROLE_GM_ID,
        'gm',
        'General Manager',
        {
          guests: ['read'],
          preferences: ['read'],
          briefs: ['read'],
          reports: ['read'],
        },
        ['B', 'C'],
      ],
      [
        ROLE_DPO_ID,
        'dpo',
        'Data Protection Officer',
        {
          guests: ['read'],
          audit: ['read', 'export'],
          compliance: ['*'],
        },
        ['A', 'B', 'C', 'D'],
      ],
    ] as const;

    for (const [id, name, display, perms, classes] of roleSpec) {
      await pool.query(
        `INSERT INTO roles(id, tenant_id, name, display_name, permissions, data_classes, is_system)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::data_class[], true)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           permissions = EXCLUDED.permissions,
           data_classes = EXCLUDED.data_classes,
           updated_at = now()`,
        [id, DEMO_TENANT_ID, name, display, JSON.stringify(perms), classes as unknown as string[]],
      );
    }

    // Property
    await pool.query(
      `INSERT INTO properties(id, tenant_id, name, short_code, city, country_code, timezone, locale)
       VALUES ($1, $2, 'Roomard Demo Hotel London', 'RDH-LON', 'London', 'GB', 'Europe/London', 'en-GB')
       ON CONFLICT (tenant_id, short_code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [DEMO_PROPERTY_ID, DEMO_TENANT_ID],
    );

    // Users
    const password = 'Roomard123!';
    const passwordHash = await bcrypt.hash(password, 12);

    const userSpec = [
      [USER_ADMIN_ID, 'admin@demo.roomard.local', 'Demo Admin', ROLE_ADMIN_ID],
      [USER_FRONT_DESK_MGR_ID, 'manager@demo.roomard.local', 'Frances Manager', ROLE_FRONT_DESK_MGR_ID],
      [USER_FRONT_DESK_AGENT_ID, 'agent@demo.roomard.local', 'Alex Agent', ROLE_FRONT_DESK_AGENT_ID],
    ] as const;

    for (const [userId, email, displayName, roleId] of userSpec) {
      await pool.query(
        `INSERT INTO users(id, tenant_id, email, display_name, status, password_hash)
         VALUES ($1, $2, $3, $4, 'active', $5)
         ON CONFLICT (tenant_id, email_lower) WHERE deleted_at IS NULL
         DO UPDATE SET display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash`,
        [userId, DEMO_TENANT_ID, email, displayName, passwordHash],
      );
      await pool.query(
        `INSERT INTO user_roles(user_id, role_id, tenant_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, roleId, DEMO_TENANT_ID],
      );
      await pool.query(
        `INSERT INTO user_properties(user_id, property_id, tenant_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [userId, DEMO_PROPERTY_ID, DEMO_TENANT_ID],
      );
    }

    // Sample guests with preferences. RLS is in force, so we set the tenant_id setting first.
    await pool.query(`SET app.tenant_id = '${DEMO_TENANT_ID}'`);
    await pool.query(`SET app.user_id = '${USER_ADMIN_ID}'`);
    await pool.query(`SET app.actor_kind = 'user'`);

    const guests = [
      {
        id: randomUUID(),
        name: 'Mr. James Patel',
        email: 'james.patel@example.com',
        country: 'GB',
        prefs: [
          ['pillow', 'requires', 'feather pillows, two stacked'],
          ['temperature', 'requires', '19°C — likes the room cool'],
          ['allergy', 'avoids', 'lilies — severe respiratory reaction'],
        ],
      },
      {
        id: randomUUID(),
        name: 'Ms. Sofia Henrik',
        email: 'sofia.henrik@example.com',
        country: 'DK',
        prefs: [
          ['dietary', 'requires', 'vegan; no dairy or eggs'],
          ['view', 'likes', 'river view, high floor'],
          ['language', 'noted', 'Danish first; English fine'],
        ],
      },
      {
        id: randomUUID(),
        name: 'Dr. Rashida Ali',
        email: 'r.ali@example.com',
        country: 'GB',
        prefs: [
          ['amenity', 'requires', 'espresso machine in room'],
          ['service', 'dislikes', 'turndown service — privacy preferred'],
          ['room_position', 'requires', 'quiet end of corridor'],
        ],
      },
    ];

    for (const g of guests) {
      await pool.query(
        `INSERT INTO guests(id, tenant_id, display_name, email_lower, home_country_code,
          name_variants, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, lower($4), $5, ARRAY[$3::text], now() - interval '6 months', now() - interval '1 month')
         ON CONFLICT DO NOTHING`,
        [g.id, DEMO_TENANT_ID, g.name, g.email, g.country],
      );
      for (const [kind, polarity, detail] of g.prefs) {
        await pool.query(
          `INSERT INTO preferences(id, tenant_id, guest_id, kind, polarity, detail, confidence)
           VALUES (gen_random_uuid(), $1, $2, $3::preference_kind, $4::preference_polarity, $5, 0.95)`,
          [DEMO_TENANT_ID, g.id, kind, polarity, detail],
        );
      }
    }

    log.info(
      {
        tenant: { id: DEMO_TENANT_ID, slug: 'demo' },
        users: userSpec.map(([, email]) => email),
        password,
      },
      'seed complete',
    );
  } finally {
    await pool.close();
  }
}

main().catch((err: unknown) => {
  log.error({ err }, 'seed failed');
  process.exit(1);
});
