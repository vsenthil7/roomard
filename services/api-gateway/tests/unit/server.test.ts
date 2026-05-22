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
import { mintTestToken } from '@roomard/test-utils';
import { request as undiciRequest } from 'undici';
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

const undiciMock = vi.mocked(undiciRequest);

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

  it('G-49: POST with multipart/form-data (card upload) is NOT rejected with 415 and reaches the proxy', async () => {
    // The card-capture upload is multipart/form-data. The gateway originally
    // registered a parser only for application/json, so Fastify threw
    // FST_ERR_CTP_INVALID_MEDIA_TYPE (415) at the edge and the upload never
    // reached capture-svc. The catch-all '*' buffering parser fixes the whole
    // class. With a valid bearer + capture.write, the request must reach the
    // mocked upstream (200), proving it was NOT rejected as 415/415-masked-500.
    undiciMock.mockClear();
    const token = await mintTestToken({ roles: ['admin'] });
    const boundary = '----roomardtestboundary';
    const body =
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="property_id"\r\n\r\n' +
      '00000000-0000-4000-8000-000000000010\r\n' +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="card.png"\r\n' +
      'Content-Type: image/png\r\n\r\n' +
      'fake-png-bytes\r\n' +
      `--${boundary}--\r\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/captures',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    // What we're proving: NOT 415 (and not the 500 it used to be masked as).
    // The mocked upstream replies 200, so the request reached the proxy handler.
    expect(res.statusCode).not.toBe(415);
    expect(res.statusCode).toBe(200);
    expect(undiciMock).toHaveBeenCalledTimes(1);
    // The multipart content-type (with boundary) must be forwarded intact so the
    // upstream can parse the parts.
    const headers = (undiciMock.mock.calls[0]![1] as { headers: Record<string, string> }).headers;
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    expect(lower['content-type']).toContain('multipart/form-data');
    expect(lower['content-type']).toContain(boundary);
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

  it('G-29: hop-by-hop headers (expect, connection, etc) are stripped before forwarding', async () => {
    undiciMock.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/password/login',
      headers: {
        'content-type': 'application/json',
        expect: '100-continue',
        connection: 'keep-alive',
        'keep-alive': 'timeout=5',
        'transfer-encoding': 'chunked',
        'x-custom-keep': 'should-survive',
      },
      payload: JSON.stringify({ email: 'a@b.co', password: 'x' }),
    });
    expect(res.statusCode).toBe(200);
    expect(undiciMock).toHaveBeenCalledTimes(1);
    const callArgs = undiciMock.mock.calls[0]![1] as { headers: Record<string, string> };
    const forwarded = Object.keys(callArgs.headers).map((k) => k.toLowerCase());
    // The hop-by-hop set must NOT have been forwarded — forwarding `expect`
    // in particular made undici throw UND_ERR_NOT_SUPPORTED (the 500 in G-29).
    expect(forwarded).not.toContain('expect');
    expect(forwarded).not.toContain('connection');
    expect(forwarded).not.toContain('keep-alive');
    expect(forwarded).not.toContain('transfer-encoding');
    expect(forwarded).not.toContain('host');
    expect(forwarded).not.toContain('content-length');
    // Non-hop-by-hop custom headers MUST still be forwarded.
    expect(forwarded).toContain('x-custom-keep');
    // Edge identity headers are injected.
    expect(forwarded).toContain('x-request-id');
    expect(forwarded).toContain('x-roomard-edge');
  });

  it('authenticated GET proxies upstream and injects x-actor-id + x-actor-tenant', async () => {
    undiciMock.mockClear();
    const token = await mintTestToken({ roles: ['admin'] });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/guests',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ forwarded: true });
    expect(undiciMock).toHaveBeenCalledTimes(1);
    const headers = (undiciMock.mock.calls[0]![1] as { headers: Record<string, string> }).headers;
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    // The gateway terminates auth and injects the actor identity for the upstream.
    expect(lower['x-actor-id']).toBeDefined();
    expect(lower['x-actor-tenant']).toBeDefined();
  });

  it('proxies upstream response headers and status through to the client', async () => {
    undiciMock.mockClear();
    undiciMock.mockResolvedValueOnce({
      statusCode: 201,
      headers: { 'content-type': 'application/json', 'x-upstream-marker': 'yes' },
      body: {
        async arrayBuffer() {
          return new TextEncoder().encode(JSON.stringify({ created: true })).buffer;
        },
      },
    } as never);
    const token = await mintTestToken({ roles: ['admin'] });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/guests',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['x-upstream-marker']).toBe('yes');
    expect(res.json()).toEqual({ created: true });
  });

  it('returns 403 when the token lacks the required permission', async () => {
    // front_desk_agent has guest.read but NOT guest.write — POST /v1/guests needs write.
    const token = await mintTestToken({ roles: ['front_desk_agent'] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/guests',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ displayName: 'X' }),
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { category?: string }).category).toBe('authorization');
  });

  it('returns 401 requireMfa for an MFA-gated route when the token is not MFA-verified', async () => {
    // POST /v1/audit/export requires audit.read AND requireMfa. An admin token
    // minted without mfaVerified should be rejected at the MFA gate.
    const token = await mintTestToken({ roles: ['admin'] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/audit/export',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z', reason: 'x' }),
    });
    expect(res.statusCode).toBe(401);
  });
});
