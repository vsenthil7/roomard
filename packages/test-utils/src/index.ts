/**
 * Shared utilities for unit, integration, and E2E tests.
 * - testPool: shared DB pool for tests
 * - withTestTenant: helper that wraps a function in a tenant-scoped transaction
 * - mintTestToken: produces a signed JWT for a test user
 * - resetDatabase: truncates non-system tables for test isolation
 * - createFakeAiGateway: in-memory deterministic mock of the AI Gateway
 */
import { randomUUID, createHash } from 'node:crypto';

import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { SignJWT, jwtVerify } from 'jose';

export const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_PROPERTY_ID = '00000000-0000-4000-8000-000000000010';
export const TEST_USER_ID = '00000000-0000-4000-8000-000000000100';

let _pool: RoomardPool | null = null;
export function getTestPool(): RoomardPool {
  if (_pool === null) {
    _pool = new RoomardPool(dbConfigFromEnv());
  }
  return _pool;
}

export async function closeTestPool(): Promise<void> {
  if (_pool !== null) {
    await _pool.close();
    _pool = null;
  }
}

/** JWT signing key for tests — DO NOT use in production. */
const TEST_JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'test-only-do-not-use-in-production-32bytes!',
);

export interface MintTokenInput {
  userId?: string;
  tenantId?: string;
  roles?: string[];
  expiresIn?: string;
}

export async function mintTestToken(input: MintTokenInput = {}): Promise<string> {
  const {
    userId = TEST_USER_ID,
    tenantId = TEST_TENANT_ID,
    roles = ['front_desk_manager'],
    expiresIn = '1h',
  } = input;

  return await new SignJWT({
    tid: tenantId,
    roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('roomard-test')
    .setAudience('roomard')
    .setExpirationTime(expiresIn)
    .sign(TEST_JWT_SECRET);
}

export async function verifyTestToken(token: string): Promise<{
  sub: string;
  tid: string;
  roles: string[];
}> {
  const { payload } = await jwtVerify(token, TEST_JWT_SECRET, {
    issuer: 'roomard-test',
    audience: 'roomard',
  });
  return {
    sub: String(payload.sub),
    tid: String(payload.tid),
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
  };
}

/**
 * Truncate all data tables (preserving system roles and migrations).
 * Used by integration tests to start from a clean state.
 */
export async function resetDatabase(): Promise<void> {
  const pool = getTestPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE
        audit_events,
        review_topics_idx,
        reviews,
        exception_queue_items,
        identity_merge_candidates,
        housekeeping_prep,
        brief_items,
        briefs,
        fb_records,
        issues,
        preference_evidence,
        preferences,
        fb_tickets,
        voice_memos,
        card_captures,
        evidence,
        stays,
        guests,
        integrations,
        user_properties,
        properties,
        refresh_tokens,
        tenant_sso_configs,
        user_roles,
        users,
        ai_call_logs,
        prompt_versions,
        prompt_templates
      RESTART IDENTITY CASCADE
    `);
    await client.query(`DELETE FROM roles WHERE tenant_id IS NOT NULL`);
    await client.query(`DELETE FROM tenants`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface FakeAiCall {
  capability: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

export interface FakeAiGateway {
  ocrCard(input: { imageBase64: string }): Promise<{
    rawText: string;
    fields: Array<{ name: string; value: string; confidence: number }>;
    modelId: string;
    durationMs: number;
  }>;
  generateBrief(input: {
    arrivals: Array<{
      guestId: string;
      displayName: string;
      preferences: string[];
      recentIssues: string[];
    }>;
  }): Promise<{
    items: Array<{
      guestId: string;
      priority: 'vip' | 'attention' | 'standard';
      sayThis: string;
      callouts: string[];
    }>;
    modelId: string;
    durationMs: number;
  }>;
  linkReview(input: {
    reviewBody: string;
    candidates: Array<{ guestId: string; displayName: string; stayDates: string }>;
  }): Promise<{
    linkedGuestId: string | null;
    confidence: number;
    reasons: string[];
    modelId: string;
  }>;
  reset(): void;
  getCalls(): readonly FakeAiCall[];
}

export function createFakeAiGateway(): FakeAiGateway {
  const calls: FakeAiCall[] = [];

  return {
    async ocrCard(input) {
      const out = {
        rawText: 'Likes Earl Grey tea, two firm pillows',
        fields: [
          { name: 'preference', value: 'Earl Grey tea', confidence: 0.92 },
          { name: 'preference', value: 'Two firm pillows', confidence: 0.88 },
        ],
        modelId: 'paddleocr-vl-mock',
        durationMs: 120,
      };
      calls.push({ capability: 'ocr.card', input, output: out, durationMs: out.durationMs });
      return out;
    },
    async generateBrief(input) {
      const items = input.arrivals.map((a, i) => ({
        guestId: a.guestId,
        priority: (i === 0 ? 'vip' : a.recentIssues.length > 0 ? 'attention' : 'standard') as
          | 'vip'
          | 'attention'
          | 'standard',
        sayThis: a.preferences[0]
          ? `Welcome back ${a.displayName}, we have ${a.preferences[0]} ready for you.`
          : `Welcome ${a.displayName}.`,
        callouts: a.preferences.slice(0, 3),
      }));
      const out = { items, modelId: 'ernie-4.5-mock', durationMs: 380 };
      calls.push({ capability: 'llm.brief', input, output: out, durationMs: out.durationMs });
      return out;
    },
    async linkReview(input) {
      const best = input.candidates[0];
      const out = {
        linkedGuestId: best ? best.guestId : null,
        confidence: best ? 0.82 : 0.0,
        reasons: best
          ? [`name "${best.displayName}" matches review author`, 'stay dates align']
          : ['no candidates available'],
        modelId: 'ernie-4.5-mock',
      };
      calls.push({ capability: 'llm.review_link', input, output: out, durationMs: 200 });
      return out;
    },
    reset() {
      calls.length = 0;
    },
    getCalls() {
      return calls;
    },
  };
}

/** Deterministic hash for snapshot assertions. */
export function deterministicHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function newUuid(): string {
  return randomUUID();
}
