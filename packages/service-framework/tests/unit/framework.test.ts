import { SignJWT } from 'jose';
import { describe, it, expect } from 'vitest';

import {
  rolesToPermissions,
  hasPermission,
  requirePermission,
  verifyAccessToken,
  authConfigFromEnv,
} from '../../src/auth.js';
import { snakeToCamel, camelToSnake } from '../../src/plugin.js';

describe('case translation', () => {
  it('translates flat snake to camel', () => {
    expect(snakeToCamel({ display_name: 'a', created_at: 'b' })).toEqual({
      displayName: 'a',
      createdAt: 'b',
    });
  });

  it('translates nested objects', () => {
    expect(snakeToCamel({ outer_key: { inner_key: 1 } })).toEqual({
      outerKey: { innerKey: 1 },
    });
  });

  it('translates arrays of objects', () => {
    expect(snakeToCamel([{ a_b: 1 }, { a_b: 2 }])).toEqual([{ aB: 1 }, { aB: 2 }]);
  });

  it('round-trips camel→snake→camel', () => {
    const original = { displayName: 'a', items: [{ innerKey: 1 }] };
    expect(snakeToCamel(camelToSnake(original))).toEqual(original);
  });

  it('leaves primitives alone', () => {
    expect(snakeToCamel('hello')).toBe('hello');
    expect(snakeToCamel(42)).toBe(42);
    expect(camelToSnake(null)).toBeNull();
  });
});

describe('RBAC', () => {
  it('admin gets wildcard', () => {
    const perms = rolesToPermissions(['admin']);
    expect(perms).toContain('*');
  });

  it('front_desk_agent has narrow read-only set', () => {
    const perms = rolesToPermissions(['front_desk_agent']);
    expect(perms).toContain('guest.read');
    expect(perms).not.toContain('guest.write');
    expect(perms).not.toContain('audit.read');
  });

  it('hasPermission honours wildcard', () => {
    const principal = {
      userId: 'u',
      tenantId: 't',
      roles: ['admin'],
      permissions: new Set(['*']),
    };
    expect(hasPermission(principal, 'audit.read')).toBe(true);
  });

  it('hasPermission honours category wildcards', () => {
    const principal = {
      userId: 'u',
      tenantId: 't',
      roles: [],
      permissions: new Set(['guest.*']),
    };
    expect(hasPermission(principal, 'guest.read')).toBe(true);
    expect(hasPermission(principal, 'audit.read')).toBe(false);
  });

  it('requirePermission throws on missing permission', () => {
    const principal = {
      userId: 'u',
      tenantId: 't',
      roles: [],
      permissions: new Set<string>(),
    };
    expect(() => requirePermission(principal, 'guest.read')).toThrow();
  });
});

describe('verifyAccessToken', () => {
  const cfg = authConfigFromEnv();

  it('parses a valid token', async () => {
    const secret = new TextEncoder().encode(cfg.jwtSecret);
    const token = await new SignJWT({
      tid: '00000000-0000-4000-8000-000000000001',
      roles: ['admin'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-8000-000000000100')
      .setIssuedAt()
      .setIssuer(cfg.issuer)
      .setAudience(cfg.audience)
      .setExpirationTime('1h')
      .sign(secret);

    const p = await verifyAccessToken(token, cfg);
    expect(p.userId).toBe('00000000-0000-4000-8000-000000000100');
    expect(p.permissions.has('*')).toBe(true);
  });

  it('rejects an empty token', async () => {
    await expect(verifyAccessToken('', cfg)).rejects.toThrow();
  });

  it('rejects a malformed token', async () => {
    await expect(verifyAccessToken('not-a-token', cfg)).rejects.toThrow();
  });
});
