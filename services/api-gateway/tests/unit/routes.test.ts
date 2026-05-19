import { describe, it, expect } from 'vitest';

import { matchRoute, ROUTES } from '../../src/routes.js';

describe('matchRoute', () => {
  it('matches /v1/guests POST to the guest service', () => {
    const r = matchRoute('POST', '/v1/guests');
    expect(r).not.toBeNull();
    expect(r!.upstream).toBe('guest');
    expect(r!.requiredPermission).toBe('guest.write');
  });

  it('matches /v1/guests/UUID with path parameter', () => {
    const r = matchRoute('GET', '/v1/guests/00000000-0000-4000-8000-000000000001');
    expect(r).not.toBeNull();
    expect(r!.upstream).toBe('guest');
  });

  it('matches /v1/guests/UUID/preferences', () => {
    const r = matchRoute('GET', '/v1/guests/abc-123/preferences');
    expect(r).not.toBeNull();
    expect(r!.requiredPermission).toBe('preference.read');
  });

  it('returns null for unknown route', () => {
    expect(matchRoute('GET', '/v1/unknown')).toBeNull();
    expect(matchRoute('POST', '/v1/guests/x/preferences')).toBeNull();
  });

  it('returns null when method does not match', () => {
    expect(matchRoute('DELETE', '/v1/guests')).toBeNull();
  });

  it('auth endpoints are marked public', () => {
    const r = matchRoute('POST', '/v1/auth/password/login');
    expect(r!.requiredPermission).toBe('public');
  });

  it('audit export requires MFA', () => {
    const r = matchRoute('POST', '/v1/audit/export');
    expect(r!.requireMfa).toBe(true);
  });

  it('every route uses an upstream that maps to a known service key', () => {
    const validKeys = new Set([
      'auth', 'tenant', 'guest', 'capture', 'brief', 'exception', 'audit', 'ingest',
    ]);
    for (const r of ROUTES) {
      expect(validKeys.has(r.upstream)).toBe(true);
    }
  });
});
