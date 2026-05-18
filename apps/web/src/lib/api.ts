/**
 * API client. Wraps fetch with:
 *   - Bearer token from session store
 *   - Automatic refresh on 401 (single-flight)
 *   - x-request-id generation
 *   - Snake/camel case translation at the boundary
 */
import { useAuthStore } from '../stores/auth.js';

const BASE = '/api';

let inFlightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { tokens: { access_token: string; refresh_token: string } };
      useAuthStore.getState().setTokens(data.tokens.access_token, data.tokens.refresh_token);
      return data.tokens.access_token;
    } catch {
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

export interface ApiOptions extends Omit<RequestInit, 'body' | 'headers'> {
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip auth header (used for login). */
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { skipAuth, body, headers = {}, ...rest } = opts;
  const requestId = crypto.randomUUID();

  const buildHeaders = (token: string | null): Record<string, string> => {
    const h: Record<string, string> = {
      accept: 'application/json',
      'x-request-id': requestId,
      ...headers,
    };
    if (!h['content-type'] && body !== undefined && !(body instanceof FormData)) {
      h['content-type'] = 'application/json';
    }
    if (!skipAuth && token) h.authorization = `Bearer ${token}`;
    return h;
  };

  const buildBody = (): BodyInit | undefined => {
    if (body === undefined) return undefined;
    if (body instanceof FormData) return body;
    return JSON.stringify(body);
  };

  let token = useAuthStore.getState().accessToken;
  let res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: buildHeaders(token),
    body: buildBody(),
  });

  if (res.status === 401 && !skipAuth) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      token = fresh;
      res = await fetch(`${BASE}${path}`, {
        ...rest,
        headers: buildHeaders(token),
        body: buildBody(),
      });
    } else {
      useAuthStore.getState().logout();
      throw new ApiError(res.status, 'unauthenticated', 'Session expired — please log in again');
    }
  }

  if (!res.ok) {
    let parsed: { error?: { code?: string; message?: string } } = {};
    try {
      parsed = (await res.json()) as typeof parsed;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, parsed.error?.code ?? 'unknown_error', parsed.error?.message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T;
  return data;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
