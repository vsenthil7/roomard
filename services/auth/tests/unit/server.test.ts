/**
 * Server-level tests for auth-svc using Fastify `app.inject()` over a real
 * AuthService backed by a fake pool. This exercises the full HTTP path AND the
 * service.ts methods that service.test.ts does not reach on their own
 * (passwordLogin success → buildSession → issueTokens, /me, refresh, logout,
 * the SSO 501 stubs, and the public-path / preHandler wiring from G-30).
 *
 * The fake pool returns seeded rows by substring-matching the SQL, so the real
 * passwordLogin → buildSession → issueTokens flow runs end to end without a DB.
 * See docs/TRACEABILITY.md for why HTTP-layer tests matter (G-28..G-32).
 */
import type { RoomardPool } from '@roomard/db';
import { createFakePool, TEST_TENANT_ID, TEST_USER_ID } from '@roomard/test-utils';
import bcryptjs from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll } from 'vitest';

import { buildServer } from '../../src/server.js';
import { AuthService, authServiceConfigFromEnv } from '../../src/service.js';

const { hash } = bcryptjs;
const PASSWORD = 'Roomard123!';

/** Build a fake pool seeded with one active admin user + its role row. */
async function seededPool(opts: { mfa?: boolean; status?: string } = {}): Promise<RoomardPool> {
  const pwHash = await hash(PASSWORD, 4);
  const pool = createFakePool([
    {
      // lookupUser (with tenantSlug join) and lookupUserById both select from users
      match: 'from users',
      rows: [
        {
          id: TEST_USER_ID,
          tenant_id: TEST_TENANT_ID,
          email: 'admin@demo.roomard.local',
          password_hash: pwHash,
          display_name: 'Demo Admin',
          status: opts.status ?? 'active',
          mfa_secret: opts.mfa ? 'JBSWY3DPEHPK3PXP' : null,
          locked_until: null,
          failed_login_count: 0,
        },
      ],
    },
    // buildSession role lookup — admin role with the object-of-arrays shape (G-32)
    {
      match: 'from user_roles',
      rows: [{ name: 'admin', permissions: { all: ['*'] } }],
    },
    // me() tenant slug lookup
    { match: 'from tenants', rows: [{ slug: 'demo' }] },
  ]);
  return pool as unknown as RoomardPool;
}

describe('auth-svc server', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = await seededPool();
    const auth = new AuthService(pool, authServiceConfigFromEnv());
    app = buildServer({ pool, auth });
    await app.ready();
  });

  it('/health responds 200 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /v1/auth/password/login is a public path (no token) and returns 200 + tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: PASSWORD,
        tenantSlug: 'demo',
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      status?: string;
      tokens?: { access_token?: string; token_type?: string };
      user?: { email?: string; roles?: string[] };
    };
    expect(body.status).toBe('success');
    expect(typeof body.tokens?.access_token).toBe('string');
    expect(body.tokens?.token_type).toBe('Bearer');
    expect(body.user?.email).toBe('admin@demo.roomard.local');
    expect(body.user?.roles).toContain('admin');
  });

  it('POST /v1/auth/password/login with a wrong password returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: 'wrong-password',
        tenantSlug: 'demo',
      }),
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { category?: string }).category).toBe('authentication');
  });

  it('POST /v1/auth/password/login with a malformed body returns 400 validation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { category?: string }).category).toBe('validation');
  });

  it('GET /v1/auth/me without a token returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /v1/auth/me with a token minted by a real login returns 200 + the user', async () => {
    // First log in to obtain a real token issued by this service.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: PASSWORD,
        tenantSlug: 'demo',
      }),
    });
    const token = (login.json() as { tokens: { access_token: string } }).tokens.access_token;
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { email?: string; tenant_slug?: string; mfa_enrolled?: boolean };
    expect(body.email).toBe('admin@demo.roomard.local');
    expect(body.tenant_slug).toBe('demo');
    expect(body.mfa_enrolled).toBe(false);
  });

  it('POST /v1/auth/refresh with an unknown refresh token returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ refreshToken: 'rt_does_not_exist' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/auth/logout without a token returns 401 (logout requires a principal)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ allDevices: true }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /v1/auth/logout with a token returns 204', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: PASSWORD,
        tenantSlug: 'demo',
      }),
    });
    const token = (login.json() as { tokens: { access_token: string } }).tokens.access_token;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ allDevices: true }),
    });
    expect(res.statusCode).toBe(204);
  });

  it('POST /v1/auth/sso/start returns 501 (honest stub, public path)', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/sso/start' });
    expect(res.statusCode).toBe(501);
  });

  it('GET /v1/auth/sso/callback returns 501 (honest stub, public path)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/auth/sso/callback' });
    expect(res.statusCode).toBe(501);
  });

  it('unknown route returns 404 canonical envelope', async () => {
    // Use a valid token so the request passes the preHandler and reaches routing;
    // without a token the framework returns 401 before route resolution.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: PASSWORD,
        tenantSlug: 'demo',
      }),
    });
    const token = (login.json() as { tokens: { access_token: string } }).tokens.access_token;
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/nope',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { category?: string }).category).toBe('not_found');
  });
});

describe('auth-svc server — MFA login path', () => {
  it('POST /v1/auth/password/login for an MFA-enrolled user returns mfa_required + mfaToken', async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = await seededPool({ mfa: true });
    const auth = new AuthService(pool, authServiceConfigFromEnv());
    const app = buildServer({ pool, auth });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: PASSWORD,
        tenantSlug: 'demo',
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status?: string; mfa_token?: string };
    expect(body.status).toBe('mfa_required');
    expect(typeof body.mfa_token).toBe('string');
    await app.close();
  });

  it('POST /v1/auth/password/login for a suspended account returns 401', async () => {
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    const pool = await seededPool({ status: 'suspended' });
    const auth = new AuthService(pool, authServiceConfigFromEnv());
    const app = buildServer({ pool, auth });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'admin@demo.roomard.local',
        password: PASSWORD,
        tenantSlug: 'demo',
      }),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
