import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hash } from 'bcryptjs';
import { AuthService, authServiceConfigFromEnv } from '../src/service.js';

interface FakeRow {
  rows: unknown[];
  rowCount?: number;
}

function makePool(handlers: Array<(sql: string, params: unknown[]) => FakeRow>): {
  pool: import('@roomard/db').RoomardPool;
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
  } as unknown as import('@roomard/db').RoomardPool;
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
