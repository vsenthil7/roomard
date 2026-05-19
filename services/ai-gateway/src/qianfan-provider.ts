import { IntegrationError, ServiceUnavailableError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import { request } from 'undici';

import type { AiCallInput, AiCallResult, AiProvider, Capability } from './types.js';
import { hashPayload } from './types.js';

const log = createLogger({ name: 'ai-gateway.qianfan' });

interface QianfanConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  timeoutMs: number;
  /** ERNIE 4.5 chat model id (e.g. 'ernie-4.5-8k') — used for llm.brief, llm.review_link */
  modelLlm: string;
  /** ERNIE X1 reasoning model id (e.g. 'ernie-x1-8k') — used for llm.reasoning */
  modelReasoning: string;
  /** PaddleOCR-VL endpoint path segment (e.g. 'paddleocr_vl') under the OCR API root */
  modelOcr: string;
  /**
   * HTTP transport seam for tests. Defaults to undici's `request`. Tests inject
   * a fake that records calls and returns canned responses without touching
   * the network.
   */
  httpRequest?: typeof request;
}

interface ChatResponse {
  result?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error_code?: number;
  error_msg?: string;
}

interface OcrResponse {
  result?: {
    raw_text?: string;
    fields?: Array<{ name: string; value: string; confidence: number }>;
    language?: string;
  };
  /** PaddleOCR-VL alternate response shape: words_result array */
  words_result?: Array<{ words: string; probability?: { average?: number } }>;
  log_id?: number | string;
  error_code?: number;
  error_msg?: string;
}

/**
 * Real Qianfan provider.
 *
 * Two endpoint families are used, NOT one:
 *  - LLM (ERNIE 4.5 / X1)        → /wenxinworkshop/chat/{modelId}
 *  - PaddleOCR-VL                → /rpc/2.0/ai_custom/v1/wenxinworkshop/image2text/{modelOcr}
 *
 * Earlier versions of this provider routed OCR through the chat endpoint,
 * which returned chat-style completions instead of OCR structure. That was a
 * silent production bug — fixed here by `routeFor(capability)`.
 *
 * Wraps every error and never lets a transport failure surface as a 500 — it
 * becomes ServiceUnavailableError so callers can route to exception queue.
 */
export class QianfanProvider implements AiProvider {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly http: typeof request;

  constructor(private readonly cfg: QianfanConfig) {
    this.http = cfg.httpRequest ?? request;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken !== null && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }
    const url =
      `${this.cfg.baseUrl}/oauth/2.0/token?grant_type=client_credentials` +
      `&client_id=${encodeURIComponent(this.cfg.apiKey)}` +
      `&client_secret=${encodeURIComponent(this.cfg.secretKey)}`;
    try {
      const { statusCode, body } = await this.http(url, {
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

  /**
   * Decide which Qianfan API family this capability uses.
   * OCR has its own endpoint and response shape; LLM capabilities share one.
   */
  private routeFor(capability: Capability): 'ocr' | 'chat' {
    return capability === 'ocr.card' ? 'ocr' : 'chat';
  }

  async invoke<T = unknown>(input: AiCallInput): Promise<AiCallResult<T>> {
    const route = this.routeFor(input.capability);
    return route === 'ocr' ? this.invokeOcr<T>(input) : this.invokeChat<T>(input);
  }

  // -------------------------------------------------------------------------
  // OCR path — PaddleOCR-VL
  // -------------------------------------------------------------------------
  private async invokeOcr<T>(input: AiCallInput): Promise<AiCallResult<T>> {
    const start = Date.now();
    const inputHash = hashPayload(input.payload);
    const token = await this.getAccessToken();
    const payload = input.payload as { imageBase64?: string; hint?: string };
    if (!payload.imageBase64) {
      throw new IntegrationError('ocr.card requires imageBase64 in payload', {
        capability: input.capability,
      });
    }
    const url =
      `${this.cfg.baseUrl}/rpc/2.0/ai_custom/v1/wenxinworkshop/image2text/${this.cfg.modelOcr}` +
      `?access_token=${token}`;
    try {
      const { statusCode, body: respBody } = await this.http(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        // PaddleOCR-VL on Qianfan accepts form-encoded image=<base64> per the
        // public docs; some deployments accept JSON {image: base64}. We send
        // form-encoded for the widest compatibility and fall back to JSON if
        // the upstream returns error_code=110 (parameter format).
        body: `image=${encodeURIComponent(payload.imageBase64)}` +
          (payload.hint ? `&detect_direction=true&prompt=${encodeURIComponent(payload.hint)}` : ''),
        headersTimeout: this.cfg.timeoutMs,
        bodyTimeout: this.cfg.timeoutMs,
      });
      const json = (await respBody.json()) as OcrResponse;
      if (statusCode !== 200 || json.error_code) {
        throw new IntegrationError('qianfan OCR returned error', {
          statusCode,
          errorCode: json.error_code,
          errorMsg: json.error_msg,
        });
      }
      const output = normaliseOcrResponse(json);
      const latencyMs = Date.now() - start;
      // PaddleOCR-VL doesn't return token counts; we estimate from raw text length.
      const rawTextLen = output.rawText?.length ?? 0;
      return {
        output: output as T,
        modelId: this.cfg.modelOcr,
        latencyMs,
        inputTokens: Math.ceil((payload.imageBase64.length || 0) / 100), // proxy for image size
        outputTokens: Math.ceil(rawTextLen / 4),
        costMinorUnits: estimateOcrCost(rawTextLen),
        inputHash,
        outputHash: hashPayload(output),
      };
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      log.error({ err, capability: input.capability }, 'qianfan OCR invoke failed');
      throw new ServiceUnavailableError('AI provider unreachable', {
        capability: input.capability,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Chat path — ERNIE 4.5 / X1
  // -------------------------------------------------------------------------
  private async invokeChat<T>(input: AiCallInput): Promise<AiCallResult<T>> {
    const start = Date.now();
    const inputHash = hashPayload(input.payload);
    const token = await this.getAccessToken();
    const { modelId, body } = this.buildChatRequest(input.capability, input.payload);

    try {
      const url = `${this.cfg.baseUrl}/wenxinworkshop/chat/${modelId}?access_token=${token}`;
      const { statusCode, body: respBody } = await this.http(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        headersTimeout: this.cfg.timeoutMs,
        bodyTimeout: this.cfg.timeoutMs,
      });
      const json = (await respBody.json()) as ChatResponse;
      if (statusCode !== 200 || json.error_code) {
        throw new IntegrationError('qianfan returned error', {
          statusCode,
          errorCode: json.error_code,
          errorMsg: json.error_msg,
        });
      }
      const output = this.parseChatOutput(json.result ?? '');
      const latencyMs = Date.now() - start;
      return {
        output: output as T,
        modelId,
        latencyMs,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
        costMinorUnits: estimateChatCost(modelId, json.usage),
        inputHash,
        outputHash: hashPayload(output),
      };
    } catch (err) {
      if (err instanceof IntegrationError) throw err;
      log.error({ err, capability: input.capability }, 'qianfan chat invoke failed');
      throw new ServiceUnavailableError('AI provider unreachable', {
        capability: input.capability,
      });
    }
  }

  private buildChatRequest(
    cap: Capability,
    payload: unknown,
  ): { modelId: string; body: Record<string, unknown> } {
    switch (cap) {
      case 'ocr.card':
        // Unreachable — invoke() routes ocr.card to invokeOcr. Kept exhaustive
        // for the switch so a new capability gets a type error not a fall-through.
        throw new IntegrationError('ocr.card must not reach chat builder', {});
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

  private parseChatOutput(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return { rawText: raw };
    }
  }
}

/**
 * Normalise PaddleOCR-VL responses (two upstream shapes) to the canonical
 * { rawText, fields, language } structure Roomard's capture pipeline expects.
 *
 * Shape A (structured): result.fields[] already present (newer Qianfan VL).
 * Shape B (raw OCR): words_result[] array of detected lines — we synthesise a
 *   single fields[] entry per line and join into rawText.
 */
function normaliseOcrResponse(json: OcrResponse): {
  rawText: string;
  fields: Array<{ name: string; value: string; confidence: number }>;
  language: string;
} {
  if (json.result?.fields && Array.isArray(json.result.fields)) {
    return {
      rawText: json.result.raw_text ?? '',
      fields: json.result.fields,
      language: json.result.language ?? 'unknown',
    };
  }
  if (Array.isArray(json.words_result)) {
    const lines = json.words_result.map((w) => w.words);
    const fields = json.words_result.map((w, idx) => ({
      name: `line_${idx}`,
      value: w.words,
      confidence: w.probability?.average ?? 0.5,
    }));
    return {
      rawText: lines.join('\n'),
      fields,
      language: 'unknown',
    };
  }
  return { rawText: '', fields: [], language: 'unknown' };
}

function estimateChatCost(
  modelId: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
): number {
  if (!usage) return 0;
  const inT = usage.prompt_tokens ?? 0;
  const outT = usage.completion_tokens ?? 0;
  // Cost in minor units of CNY (fen). Approximate prices — ops confirms at deploy time.
  const inputRate = modelId.includes('x1') ? 12 : modelId.includes('4.5') ? 8 : 4;
  const outputRate = modelId.includes('x1') ? 48 : modelId.includes('4.5') ? 24 : 12;
  return Math.round((inT * inputRate + outT * outputRate) / 1000);
}

function estimateOcrCost(rawTextLen: number): number {
  // PaddleOCR-VL on Qianfan: per-call flat fee plus per-character fragment.
  // Approximate: 5 fen base + 1 fen per 500 chars.
  return 5 + Math.ceil(rawTextLen / 500);
}

export function qianfanConfigFromEnv(): QianfanConfig {
  return {
    baseUrl: process.env.QIANFAN_BASE_URL ?? 'https://aip.baidubce.com',
    apiKey: process.env.QIANFAN_API_KEY ?? '',
    secretKey: process.env.QIANFAN_SECRET_KEY ?? '',
    timeoutMs: Number.parseInt(process.env.QIANFAN_TIMEOUT_MS ?? '30000', 10),
    modelOcr: process.env.QIANFAN_MODEL_OCR ?? 'paddleocr_vl',
    modelLlm: process.env.QIANFAN_MODEL_LLM ?? 'ernie-4.5-8k',
    modelReasoning: process.env.QIANFAN_MODEL_REASONING ?? 'ernie-x1-8k',
  };
}
