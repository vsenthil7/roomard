/**
 * Tests for the AiGateway facade (index.ts) — provider selection, the invoke
 * success/failure logging path, and the per-minute + daily cap enforcement.
 * The pool is a createFakePool stand-in; the provider is a stub so we never
 * touch a real model.
 */
import { RateLimitError } from '@roomard/errors';
import { createFakePool } from '@roomard/test-utils';
import { describe, it, expect, vi } from 'vitest';

import { AiGateway, MockAiProvider, gatewayConfigFromEnv, type GatewayConfig } from '../../src/index.js';
import type { AiCallInput, AiCallResult, AiProvider } from '../../src/types.js';

const TENANT = '00000000-0000-4000-8000-000000000001';

function input(overrides: Partial<AiCallInput> = {}): AiCallInput {
  return {
    capability: 'llm.brief',
    tenantId: TENANT,
    requestId: '00000000-0000-4000-8000-0000000ae001',
    payload: { hello: 'world' },
    ...overrides,
  } as AiCallInput;
}

function okResult(): AiCallResult {
  return {
    output: { ok: true },
    modelId: 'stub-model',
    inputHash: 'ih',
    outputHash: 'oh',
    inputTokens: 10,
    outputTokens: 20,
    latencyMs: 5,
    costMinorUnits: 0,
  } as AiCallResult;
}

const noCaps: GatewayConfig = { useMock: true, tenantDailyTokenCap: 0, tenantPerMinuteCap: 0 };

describe('AiGateway facade', () => {
  it('selects the MockAiProvider when useMock is set', () => {
    const pool = createFakePool();
    const gw = new AiGateway(pool as never, noCaps);
    // Reaching into the private field is acceptable in a unit test to assert wiring.
    expect((gw as unknown as { provider: AiProvider }).provider).toBeInstanceOf(MockAiProvider);
  });

  it('uses an injected provider override', () => {
    const pool = createFakePool();
    const stub: AiProvider = { invoke: vi.fn() };
    const gw = new AiGateway(pool as never, noCaps, stub);
    expect((gw as unknown as { provider: AiProvider }).provider).toBe(stub);
  });

  it('invoke returns the provider result and logs the call (success path)', async () => {
    const logged: string[] = [];
    const pool = createFakePool([{ match: 'insert into ai_call_logs', rows: [] }]);
    const origQuery = pool.query.bind(pool);
    pool.query = (sql: string, params?: unknown[]) => {
      if (sql.toLowerCase().includes('insert into ai_call_logs')) logged.push(String(params?.[4]));
      return origQuery(sql, params);
    };
    const stub: AiProvider = { invoke: vi.fn().mockResolvedValue(okResult()) };
    const gw = new AiGateway(pool as never, noCaps, stub);
    const res = await gw.invoke(input());
    expect(res.modelId).toBe('stub-model');
    expect(stub.invoke).toHaveBeenCalledOnce();
    // logCall ran with status 'success'.
    expect(logged).toContain('success');
  });

  it('invoke logs failure and rethrows when the provider throws', async () => {
    const logged: string[] = [];
    const pool = createFakePool();
    const origQuery = pool.query.bind(pool);
    pool.query = (sql: string, params?: unknown[]) => {
      if (sql.toLowerCase().includes('insert into ai_call_logs')) logged.push(String(params?.[4]));
      return origQuery(sql, params);
    };
    const stub: AiProvider = { invoke: vi.fn().mockRejectedValue(new Error('provider down')) };
    const gw = new AiGateway(pool as never, noCaps, stub);
    await expect(gw.invoke(input())).rejects.toThrow('provider down');
    expect(logged).toContain('failure');
  });

  it('enforces the per-minute cap (RateLimitError when count >= cap)', async () => {
    const pool = createFakePool([
      { match: "interval '60 seconds'", rows: [{ count: '120' }] },
    ]);
    const stub: AiProvider = { invoke: vi.fn().mockResolvedValue(okResult()) };
    const gw = new AiGateway(
      pool as never,
      { useMock: false, tenantDailyTokenCap: 0, tenantPerMinuteCap: 120 },
      stub,
    );
    await expect(gw.invoke(input())).rejects.toBeInstanceOf(RateLimitError);
    expect(stub.invoke).not.toHaveBeenCalled();
  });

  it('enforces the daily token cap (RateLimitError when tokens >= cap)', async () => {
    const pool = createFakePool([
      { match: 'date_trunc', rows: [{ tokens: '1000000' }] },
    ]);
    const stub: AiProvider = { invoke: vi.fn().mockResolvedValue(okResult()) };
    const gw = new AiGateway(
      pool as never,
      { useMock: false, tenantDailyTokenCap: 1000000, tenantPerMinuteCap: 0 },
      stub,
    );
    await expect(gw.invoke(input())).rejects.toBeInstanceOf(RateLimitError);
    expect(stub.invoke).not.toHaveBeenCalled();
  });

  it('allows the call when usage is under both caps', async () => {
    const pool = createFakePool([
      { match: "interval '60 seconds'", rows: [{ count: '3' }] },
      { match: 'date_trunc', rows: [{ tokens: '500' }] },
      { match: 'insert into ai_call_logs', rows: [] },
    ]);
    const stub: AiProvider = { invoke: vi.fn().mockResolvedValue(okResult()) };
    const gw = new AiGateway(
      pool as never,
      { useMock: false, tenantDailyTokenCap: 1000000, tenantPerMinuteCap: 120 },
      stub,
    );
    const res = await gw.invoke(input());
    expect(res.modelId).toBe('stub-model');
    expect(stub.invoke).toHaveBeenCalledOnce();
  });

  it('gatewayConfigFromEnv reads the cap + mock settings from env', () => {
    const prev = { ...process.env };
    process.env.AI_GATEWAY_MOCK = 'true';
    process.env.AI_TENANT_DAILY_TOKEN_CAP = '5000';
    process.env.AI_TENANT_PER_MINUTE_CAP = '42';
    try {
      const cfg = gatewayConfigFromEnv();
      expect(cfg.useMock).toBe(true);
      expect(cfg.tenantDailyTokenCap).toBe(5000);
      expect(cfg.tenantPerMinuteCap).toBe(42);
    } finally {
      process.env = prev;
    }
  });
});
