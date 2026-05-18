import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, ApiError } from '../src/lib/api.js';
import { useAuthStore } from '../src/stores/auth.js';

describe('apiFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuthStore.getState().logout();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches Bearer token from store', async () => {
    useAuthStore.getState().setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await apiFetch('/v1/anything');
    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer access-1' });
  });

  it('throws ApiError on 4xx with error envelope', async () => {
    useAuthStore.getState().setTokens('a', 'r');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'forbidden', message: 'nope' } }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(apiFetch('/v1/x')).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'nope',
    });
  });

  it('attempts token refresh on 401 then retries once', async () => {
    useAuthStore.getState().setTokens('expired', 'refresh-1');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'expired' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tokens: { access_token: 'access-2', refresh_token: 'refresh-2' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const out = await apiFetch<{ ok: boolean }>('/v1/data');
    expect(out.ok).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('access-2');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('logs the user out when refresh also fails', async () => {
    useAuthStore.getState().setTokens('expired', 'refresh-1');
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(apiFetch('/v1/data')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('skipAuth omits the Authorization header', async () => {
    useAuthStore.getState().setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'success' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await apiFetch('/v1/auth/password/login', {
      method: 'POST',
      body: { email: 'x', password: 'y', tenant_slug: 'demo' },
      skipAuth: true,
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });
});
