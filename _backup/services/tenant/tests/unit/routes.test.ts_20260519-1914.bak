import { SignJWT } from 'jose';
import { describe, it, expect, vi } from 'vitest';

import { buildServer } from '../../src/server.js';

describe('tenant-svc routes', () => {
  it('rejects unauthenticated request', async () => {
    const pool = { query: vi.fn(), connect: vi.fn(), close: vi.fn() } as unknown as import('@roomard/db').RoomardPool;
    const app = buildServer({ pool });
    const res = await app.inject({ method: 'GET', url: '/v1/tenant' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 on /health without auth', async () => {
    const pool = { query: vi.fn(), connect: vi.fn(), close: vi.fn() } as unknown as import('@roomard/db').RoomardPool;
    const app = buildServer({ pool });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'tenant' });
  });

  it('returns 403 when role lacks permission', async () => {
    const pool = { query: vi.fn(), connect: vi.fn(), close: vi.fn() } as unknown as import('@roomard/db').RoomardPool;
    const app = buildServer({ pool });
    const secret = new TextEncoder().encode('test-only-do-not-use-in-production-32bytes!');
    const token = await new SignJWT({
      tid: '00000000-0000-4000-8000-000000000001',
      roles: ['front_desk_agent'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-4000-8000-000000000100')
      .setIssuedAt()
      .setIssuer('roomard')
      .setAudience('roomard')
      .setExpirationTime('1h')
      .sign(secret);
    const res = await app.inject({
      method: 'GET',
      url: '/v1/tenant',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
