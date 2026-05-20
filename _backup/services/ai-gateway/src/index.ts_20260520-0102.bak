/**
 * Gateway facade — feature services depend on this, never on a concrete provider.
 */
import type { RoomardPool } from '@roomard/db';
import { RateLimitError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';

import { MockAiProvider } from './mock-provider.js';
import { QianfanProvider, qianfanConfigFromEnv } from './qianfan-provider.js';
import type { AiCallInput, AiCallResult, AiProvider, Capability } from './types.js';

export * from './types.js';
export { MockAiProvider } from './mock-provider.js';
export { QianfanProvider, qianfanConfigFromEnv } from './qianfan-provider.js';

const log = createLogger({ name: 'ai-gateway' });

export interface GatewayConfig {
  /** When true, use MockAiProvider regardless of QIANFAN_* env. */
  useMock: boolean;
  /** Max input+output tokens per tenant per UTC day. 0 = unlimited. */
  tenantDailyTokenCap: number;
  /** Max calls per tenant per minute. 0 = unlimited. */
  tenantPerMinuteCap: number;
}

export function gatewayConfigFromEnv(): GatewayConfig {
  return {
    useMock: process.env.AI_GATEWAY_MOCK === 'true',
    tenantDailyTokenCap: Number.parseInt(process.env.AI_TENANT_DAILY_TOKEN_CAP ?? '1000000', 10),
    tenantPerMinuteCap: Number.parseInt(process.env.AI_TENANT_PER_MINUTE_CAP ?? '120', 10),
  };
}

export class AiGateway {
  private readonly provider: AiProvider;

  constructor(
    private readonly pool: RoomardPool,
    private readonly cfg: GatewayConfig,
    providerOverride?: AiProvider,
  ) {
    if (providerOverride) {
      this.provider = providerOverride;
    } else if (cfg.useMock) {
      this.provider = new MockAiProvider();
    } else {
      this.provider = new QianfanProvider(qianfanConfigFromEnv());
    }
  }

  async invoke<T = unknown>(input: AiCallInput): Promise<AiCallResult<T>> {
    await this.enforceCaps(input.tenantId);

    let status: 'success' | 'failure' = 'success';
    let result: AiCallResult<T> | undefined;
    let errMessage: string | undefined;
    const requestedAt = new Date();

    try {
      result = await this.provider.invoke<T>(input);
      return result;
    } catch (err) {
      status = 'failure';
      errMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      try {
        await this.logCall(input, requestedAt, result, status, errMessage);
      } catch (logErr) {
        log.error({ err: logErr, requestId: input.requestId }, 'failed to log ai call');
      }
    }
  }

  private async enforceCaps(tenantId: string): Promise<void> {
    if (this.cfg.tenantDailyTokenCap === 0 && this.cfg.tenantPerMinuteCap === 0) return;
    const client = await this.pool.connect();
    try {
      if (this.cfg.tenantPerMinuteCap > 0) {
        const { rows } = await client.query<{ count: string }>(
          `SELECT count(*)::text as count
           FROM ai_call_logs
           WHERE tenant_id = $1::uuid
             AND requested_at >= now() - interval '60 seconds'`,
          [tenantId],
        );
        const minuteCount = Number.parseInt(rows[0]?.count ?? '0', 10);
        if (minuteCount >= this.cfg.tenantPerMinuteCap) {
          throw new RateLimitError('AI call rate exceeded', 60);
        }
      }
      if (this.cfg.tenantDailyTokenCap > 0) {
        const { rows } = await client.query<{ tokens: string }>(
          `SELECT COALESCE(sum(input_tokens + output_tokens), 0)::text as tokens
           FROM ai_call_logs
           WHERE tenant_id = $1::uuid
             AND requested_at >= date_trunc('day', now() at time zone 'UTC')`,
          [tenantId],
        );
        const tokens = Number.parseInt(rows[0]?.tokens ?? '0', 10);
        if (tokens >= this.cfg.tenantDailyTokenCap) {
          throw new RateLimitError('AI daily token cap reached', 3600);
        }
      }
    } finally {
      client.release();
    }
  }

  private async logCall(
    input: AiCallInput,
    requestedAt: Date,
    result: AiCallResult | undefined,
    status: 'success' | 'failure',
    errMessage: string | undefined,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_call_logs (
         id, tenant_id, request_id, capability, model_id, status,
         input_hash, output_hash, input_tokens, output_tokens,
         latency_ms, cost_minor_units, error_message, requested_at
       ) VALUES (
         gen_random_uuid(), $1::uuid, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12, $13
       )`,
      [
        input.tenantId,
        input.requestId,
        input.capability,
        result?.modelId ?? 'unknown',
        status,
        result?.inputHash ?? 'n/a',
        result?.outputHash ?? null,
        result?.inputTokens ?? 0,
        result?.outputTokens ?? 0,
        result?.latencyMs ?? 0,
        result?.costMinorUnits ?? 0,
        errMessage ?? null,
        requestedAt.toISOString(),
      ],
    );
  }
}

export type { Capability };
