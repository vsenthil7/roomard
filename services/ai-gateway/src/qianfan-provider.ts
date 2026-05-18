import { request } from 'undici';
import { IntegrationError, ServiceUnavailableError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import type { AiCallInput, AiCallResult, AiProvider, Capability } from './types.js';
import { hashPayload } from './types.js';

const log = createLogger({ name: 'ai-gateway.qianfan' });

interface QianfanConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  timeoutMs: number;
  modelOcr: string;
  modelLlm: string;
  modelReasoning: string;
}

/**
 * Real Qianfan provider. Posts to ERNIE chat completions API and PaddleOCR-VL endpoint.
 * Wraps every error and never lets a transport failure surface as a 500 — it becomes
 * ServiceUnavailableError so callers can route to exception queue.
 */
export class QianfanProvider implements AiProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly cfg: QianfanConfig) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken !== null && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }
    const url =
      `${this.cfg.baseUrl}/oauth/2.0/token?grant_type=client_credentials` +
      `&client_id=${encodeURIComponent(this.cfg.apiKey)}` +
      `&client_secret=${encodeURIComponent(this.cfg.secretKey)}`;
    try {
      const { statusCode, body } = await request(url, {
        method: 'POST',
        headersTimeout: this.cfg.timeoutMs,
        bodyTimeout: this.cfg.timeoutMs,
      });
      const json = (await body.json()) as { access_token?: string; expires_in?: number };
      if (statusCode !== 200 || !json.access_token) {
        throw new IntegrationError('failed to acquire Qianfan token', { statusCode });
      }
      this.accessToken = json.access_token;
      this.tokenExpiresAt = Date.now() + (json.expires_in ?? 2592000) * 1000;
      return this.accessToken;
    } catch (err) {
      log.error({ err }, 'qianfan token acquisition failed');
      throw new ServiceUnavailableError('AI provider unreachable', { cause: 'token' });
    }
  }

  async invoke<T = unknown>(input: AiCallInput): Promise<AiCallResult<T>> {
    const start = Date.now();
    const inputHash = hashPayload(input.payload);
    const token = await this.getAccessToken();
    const { modelId, body } = this.buildRequest(input.capability, input.payload);

    try {
      const url = `${this.cfg.baseUrl}/wenxinworkshop/chat/${modelId}?access_token=${token}`;
      const { statusCode, body: respBody } = await request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        headersTimeout: this.cfg.timeoutMs,
        bodyTimeout: this.cfg.timeoutMs,
      });
      const json = (await respBody.json()) as {
        result?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error_code?: number;
        error_msg?: string;
      };
      if (statusCode !== 200 || json.error_code) {
        throw new IntegrationError('qianfan returned error', {
          statusCode,
          errorCode: json.error_code,
          errorMsg: json.error_msg,
        });
      }
      const output = this.parseOutput(input.capability, json.result ?? '');
      const latencyMs = Date.now() - start;
      return {
        output: output as T,
        modelId,
        latencyMs,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        costMinorUnits: estimateCost(modelId, json.usage),
        inputHash,
        outputHash: hashPayload(output),
      };
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      log.error({ err, capability: input.capability }, 'qianfan invoke failed');
      throw new ServiceUnavailableError('AI provider unreachable', {
        capability: input.capability,
      });
    }
  }

  private buildRequest(
    cap: Capability,
    payload: unknown,
  ): { modelId: string; body: Record<string, unknown> } {
    switch (cap) {
      case 'ocr.card':
        return {
          modelId: this.cfg.modelOcr,
          body: {
            messages: [
              {
                role: 'user',
                content: `Extract guest preferences from this preference card. Return JSON: {rawText, fields:[{name,value,confidence}]}.\n\n${JSON.stringify(payload)}`,
              },
            ],
            response_format: { type: 'json_object' },
          },
        };
      case 'llm.brief':
        return {
          modelId: this.cfg.modelLlm,
          body: {
            messages: [
              {
                role: 'system',
                content:
                  'You are Roomard, an AI assistant generating concise daily front-desk briefs for hotels. Output strict JSON.',
              },
              { role: 'user', content: JSON.stringify(payload) },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          },
        };
      case 'llm.review_link':
        return {
          modelId: this.cfg.modelLlm,
          body: {
            messages: [
              {
                role: 'system',
                content:
                  'You link guest reviews to candidate guests by analysing name, dates, and content. Output strict JSON with linkedGuestId|null, confidence (0-1), and reasons[].',
              },
              { role: 'user', content: JSON.stringify(payload) },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          },
        };
      case 'llm.reasoning':
        return {
          modelId: this.cfg.modelReasoning,
          body: {
            messages: [{ role: 'user', content: (payload as { prompt: string }).prompt }],
          },
        };
    }
  }

  private parseOutput(_cap: Capability, raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return { rawText: raw };
    }
  }
}

function estimateCost(
  modelId: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): number {
  if (!usage) return 0;
  const inT = usage.prompt_tokens ?? 0;
  const outT = usage.completion_tokens ?? 0;
  // Cost in minor units of CNY (fen). Approximate prices — confirmation by ops at deploy time.
  const inputRate = modelId.includes('x1') ? 12 : modelId.includes('4.5') ? 8 : 4;
  const outputRate = modelId.includes('x1') ? 48 : modelId.includes('4.5') ? 24 : 12;
  return Math.round((inT * inputRate + outT * outputRate) / 1000);
}

export function qianfanConfigFromEnv(): QianfanConfig {
  return {
    baseUrl: process.env.QIANFAN_BASE_URL ?? 'https://aip.baidubce.com',
    apiKey: process.env.QIANFAN_API_KEY ?? '',
    secretKey: process.env.QIANFAN_SECRET_KEY ?? '',
    timeoutMs: Number.parseInt(process.env.QIANFAN_TIMEOUT_MS ?? '30000', 10),
    modelOcr: process.env.QIANFAN_MODEL_OCR ?? 'paddleocr-vl',
    modelLlm: process.env.QIANFAN_MODEL_LLM ?? 'ernie-4.5-8k',
    modelReasoning: process.env.QIANFAN_MODEL_REASONING ?? 'ernie-x1-8k',
  };
}
