import type { RoomardPool } from '@roomard/db';
import bcryptjs from 'bcryptjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AuthService, authServiceConfigFromEnv } from '../../src/service.js';

// bcryptjs is CommonJS — default-import + destructure for runtime ESM safety.
const { hash } = bcryptjs;

interface FakeRow {
  rows: unknown[];
  rowCount?: number;
}

function makePool(handlers: Array<(sql: string, params: unknown[]) => FakeRow>): {
  pool: RoomardPool;
  calls: Array<{ sql: string; params: unknown[] }>;
} {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let idx = 0;
  const exec = (sql: string, params: unknown[] = []): FakeRow => {
    calls.push({ sql, params });
    const handler = handlers[idx];
    if (!handler) {
      throw new Error(`unexpected query #${idx + 1}: ${sql.slice(0, 80)}`);
    }
    idx += 1;
    return handler(sql, params);
  };
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => exec(sql, params)),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => exec(sql, params)),
    connect: vi.fn(async () => client),
    close: vi.fn(async () => {}),
  } as unknown as RoomardPool;
  return { pool, calls };
}

describe('AuthService.passwordLogin', () => {
  const cfg = authServiceConfigFromEnv();

  beforeEach(() => vi.clearAllMocks());

  it('returns mfa_required when user has mfa_secret', async () => {
    const password = 'Roomard123!';
    const pwHash = await hash(password, 4);
    const { pool } = makePool([
      // lookupUser
      () => ({
        rows: [
          {
            id: '00000000-0000-4000-8000-000000000100',
            tenant_id: '00000000-0000-4000-8000-000000000001',
            email: 'agent@x',
            password_hash: pwHash,
            display_name: 'Agent',
            status: 'active',
            mfa_secret: 'JBSWY3DPEHPK3PXP',
            locked_until: null,
            failed_login_count: 0,
          },
        ],
      }),
      // clear failed logins
      () => ({ rows: [] }),
    ]);
    const svc = new AuthService(pool, cfg);
    const out = await svc.passwordLogin({ email: 'agent@x', password });
    expect(out.status).toBe('mfa_required');
  });

  it('rejects bad password and increments failed_login_count', async () => {
    const pwHash = await hash('rightpw', 4);
    const { pool } = makePool([
      () => ({
        rows: [
          {
            id: 'u1',
            tenant_id: 't1',
            email: 'a@b.co',
            password_hash: pwHash,
            display_name: 'A',
            status: 'active',
            mfa_secret: null,
            locked_until: null,
            failed_login_count: 0,
          },
        ],
      }),
      // recordFailedLogin
      () => ({ rows: [] }),
    ]);
    const svc = new AuthService(pool, cfg);
    await expect(svc.passwordLogin({ email: 'a@b.co', password: 'wrong' })).rejects.toThrow(
      /invalid credentials/i,
    );
  });

  it('rejects when user not found', async () => {
    const { pool } = makePool([() => ({ rows: [] })]);
    const svc = new AuthService(pool, cfg);
    await expect(svc.passwordLogin({ email: 'nobody@x', password: 'x' })).rejects.toThrow(
      /invalid credentials/i,
    );
  });

  it('rejects when account is locked', async () => {
    const pwHash = await hash('rightpw', 4);
    const future = new Date(Date.now() + 60_000);
    const { pool } = makePool([
      () => ({
        rows: [
          {
            id: 'u1',
            tenant_id: 't1',
            email: 'a@b.co',
            password_hash: pwHash,
            display_name: 'A',
            status: 'active',
            mfa_secret: null,
            locked_until: future,
            failed_login_count: 5,
          },
        ],
      }),
    ]);
    const svc = new AuthService(pool, cfg);
    await expect(svc.passwordLogin({ email: 'a@b.co', password: 'rightpw' })).rejects.toThrow(
      /locked/i,
    );
  });

  it('rejects when status is not active', async () => {
    const pwHash = await hash('rightpw', 4);
    const { pool } = makePool([
      () => ({
        rows: [
          {
            id: 'u1',
            tenant_id: 't1',
            email: 'a@b.co',
            password_hash: pwHash,
            display_name: 'A',
            status: 'suspended',
            mfa_secret: null,
            locked_until: null,
            failed_login_count: 0,
          },
        ],
      }),
    ]);
    const svc = new AuthService(pool, cfg);
    await expect(svc.passwordLogin({ email: 'a@b.co', password: 'rightpw' })).rejects.toThrow(
      /not active/i,
    );
  });
});

describe('authServiceConfigFromEnv — production hardening', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    // Reset every env var this function reads so tests don't bleed into each other.
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
  });
  // Restore originals after the suite to avoid affecting other test files.
  // (vitest isolates test files by default, but explicit is safer.)
  const _restore = (): void => {
    process.env = { ...originalEnv };
  };

  it('returns dev default secret outside production when JWT_SECRET unset', () => {
    process.env.NODE_ENV = 'development';
    const cfg = authServiceConfigFromEnv();
    expect(cfg.jwtSecret).toMatch(/test-only/);
  });

  it('throws when NODE_ENV=production and JWT_SECRET is unset', () => {
    process.env.NODE_ENV = 'production';
    expect(() => authServiceConfigFromEnv()).toThrow(/JWT_SECRET/);
  });

  it('throws when NODE_ENV=production and JWT_SECRET is the dev default', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    expect(() => authServiceConfigFromEnv()).toThrow(/JWT_SECRET/);
  });

  it('accepts a real JWT_SECRET in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(48); // any non-default value
    const cfg = authServiceConfigFromEnv();
    expect(cfg.jwtSecret).toHaveLength(48);
  });
});
