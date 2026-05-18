/**
 * AI Gateway — single abstraction layer in front of all model providers.
 *
 * Capabilities (per Architecture §6):
 *   - ocr.card       → PaddleOCR-VL via Qianfan MaaS
 *   - llm.brief      → ERNIE 4.5
 *   - llm.review_link→ ERNIE 4.5
 *   - llm.reasoning  → ERNIE X1 (long-form reasoning)
 *
 * Every call goes through this gateway so we can:
 *   - Cap tokens per tenant per day
 *   - Log to ai_call_logs (model_id, latency, cost, input/output hash)
 *   - Swap providers without touching feature services
 *   - Switch to mock backend in tests by setting AI_GATEWAY_MOCK=true
 *
 * Reads are NEVER allowed to PII without a confidence < 0.75 → exception_queue.
 */
import { createHash } from 'node:crypto';

export type Capability = 'ocr.card' | 'llm.brief' | 'llm.review_link' | 'llm.reasoning';

export interface AiCallInput {
  capability: Capability;
  tenantId: string;
  requestId: string;
  payload: unknown;
}

export interface AiCallResult<T = unknown> {
  output: T;
  modelId: string;
  promptVersion?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costMinorUnits: number;
  inputHash: string;
  outputHash: string;
}

export interface AiProvider {
  invoke<T = unknown>(input: AiCallInput): Promise<AiCallResult<T>>;
}

export function hashPayload(payload: unknown): string {
  const canonical =
    typeof payload === 'string' ? payload : JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
