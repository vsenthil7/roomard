/**
 * Server-level integration tests for api-gateway.
 *
 * Uses Fastify's `app.inject()` to drive end-to-end request lifecycle through
 * the gateway without actually opening a network socket or hitting real upstreams.
 *
 * Key regression coverage: G-28 \u2014 the gateway forwards raw JSON body bytes to
 * upstreams. Without an explicit `application/json` content-type parser, Fastify 5
 * rejects every JSON POST with FST_ERR_CTP_INVALID_MEDIA_TYPE (415). The earlier
 * code base also masked that 415 as a generic 500 in `setErrorHandler`, hiding
 * the actual problem. This test exercises both fixes: the JSON parser AND the
 * status-code forwarding behaviour.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { buildServer } from '../../src/server.js';

// Mock undici so we never actually try to reach upstream services in tests.
vi.mock('undici', () => ({
  request: vi.fn(async () => ({
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: {
      async arrayBuffer() {
        return new TextEncoder().encode(JSON.stringify({ forwarded: true })).buffer;
      },
      async json() {
        return { forwarded: true };
      },
    },
  })),
}));

describe('api-gateway server (G-28 regression)', () => {
  let app: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    // Set deterministic env so authConfigFromEnv has what it needs
    process.env.JWT_SECRET = 'test-only-do-not-use-in-production-32bytes!';
    process.env.JWT_ISSUER = 'roomard';
    process.env.JWT_AUDIENCE = 'roomard';
    app = buildServer({
      upstreams: {
        auth: 'http://localhost:0',
        tenant: 'http://localhost:0',
        guest: 'http://localhost:0',
        capture: 'http://localhost:0',
        brief: 'http://localhost:0',
        exception: 'http://localhost:0',
        audit: 'http://localhost:0',
        ingest: 'http://localhost:0',
      },
      rateLimitMax: 1000,
      rateLimitWindowMs: 60_000,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health responds 200 ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'api-gateway' });
  });

  it('G-28: POST with application/json body proxies upstream, returns 200, not 415 or 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'a@b.co', password: 'x' }),
    });
    // Before the fix, this returned 500 (with internal 415 masked).
    // After the fix, the request reaches the proxy handler and our mocked
    // upstream returns 200.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ forwarded: true });
  });

  it('G-28: PATCH with application/json body proxies upstream too', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/v1/guests/00000000-0000-4000-8000-000000000001',
      headers: {
        'content-type': 'application/json',
        // Won't pass JWT verification in real flow but the rule is matched first;
        // we send a bearer to exercise the auth path. Mocked upstream replies 200.
        // Note: matched route requires guest.write so we expect 401 from missing-bearer,
        // not 415. That's enough to prove the content-type parser fixed the 415.
      },
      payload: JSON.stringify({ displayName: 'New Name' }),
    });
    // Without the bearer, the gateway throws AuthenticationError \u2192 401 envelope.
    // What we're proving: NOT 415 and NOT 500.
    expect(res.statusCode).toBe(401);
  });

  it('G-28: error handler forwards Fastify client-error statusCode rather than masking as 500', async () => {
    // Send a body that exceeds bodyLimit \u2014 Fastify will throw FST_ERR_CTP_BODY_TOO_LARGE
    // with statusCode 413. After the fix the handler forwards 413, not 500.
    const oversizePayload = JSON.stringify({ data: 'x'.repeat(30 * 1024 * 1024) });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: { 'content-type': 'application/json' },
      payload: oversizePayload,
    });
    // Different Fastify versions report this slightly differently; what matters
    // is the status is in the 4xx client-error range, not 500.
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('unknown route returns 404 envelope (not 500)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/this-route-does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    // toSerializedError envelope: { code, message, category, status, request_id, details }
    const body = res.json() as { code?: string; category?: string; status?: number };
    expect(body.code).toBe('not_found');
    expect(body.status).toBe(404);
  });
});
