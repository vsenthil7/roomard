/**
 * QianfanProvider tests — verify endpoint routing per capability.
 *
 * The bug these tests guard against: earlier versions routed every capability
 * including ocr.card through /wenxinworkshop/chat/{model}, which returns
 * chat-style completions, not OCR structure. The fix splits the path; these
 * tests pin the contract so a regression can't go silent again.
 */
import { IntegrationError, ServiceUnavailableError } from '@roomard/errors';
import { describe, it, expect, vi } from 'vitest';

import { QianfanProvider } from '../../src/qianfan-provider.js';
import type { AiCallInput } from '../../src/types.js';

interface FakeCall {
  url: string;
  method: string;
  body?: string;
  contentType?: string;
}

function makeFakeHttp(responses: Array<{ statusCode: number; json: unknown }>): {
  http: (url: string, opts: Record<string, unknown>) => Promise<{
    statusCode: number;
    body: { json: () => Promise<unknown> };
  }>;
  calls: FakeCall[];
} {
  let idx = 0;
  const calls: FakeCall[] = [];
  const http = async (
    url: string,
    opts: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: { json: () => Promise<unknown> } }> => {
    const headers = (opts.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method: String(opts.method ?? 'GET'),
      body: typeof opts.body === 'string' ? opts.body : undefined,
      contentType: headers['content-type'],
    });
    const resp = responses[idx];
    if (!resp) throw new Error(`unexpected http call #${idx + 1} to ${url}`);
    idx += 1;
    return {
      statusCode: resp.statusCode,
      body: { json: async () => resp.json },
    };
  };
  return { http: http as never, calls };
}

const baseConfig = {
  baseUrl: 'https://aip.baidubce.com',
  apiKey: 'test-key',
  secretKey: 'test-secret',
  timeoutMs: 5000,
  modelLlm: 'ernie-4.5-8k',
  modelReasoning: 'ernie-x1-8k',
  modelOcr: 'paddleocr_vl',
};

const TENANT_UUID = '00000000-0000-4000-8000-000000000001';

describe('QianfanProvider — endpoint routing', () => {
  it('routes ocr.card to PaddleOCR-VL endpoint, NOT the chat endpoint', async () => {
    const { http, calls } = makeFakeHttp([
      // 1. Token acquisition
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      // 2. OCR call returns structured shape (Shape A)
      {
        statusCode: 200,
        json: {
          result: {
            raw_text: 'Likes Earl Grey tea',
            fields: [
              { name: 'preference.beverage', value: 'Earl Grey tea', confidence: 0.91 },
            ],
            language: 'en',
          },
        },
      },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    const input: AiCallInput = {
      capability: 'ocr.card',
      tenantId: TENANT_UUID,
      requestId: 'r-1',
      payload: { imageBase64: 'ZmFrZS1pbWFnZS1ieXRlcw==', hint: 'check-in card' },
    };
    const result = await provider.invoke(input);

    // The token call goes to /oauth/2.0/token — fine.
    expect(calls[0]?.url).toContain('/oauth/2.0/token');

    // CRITICAL: the OCR call must NOT touch /wenxinworkshop/chat/.
    expect(calls[1]?.url).not.toContain('/wenxinworkshop/chat/');
    // It must hit the image2text endpoint with the configured OCR model.
    expect(calls[1]?.url).toContain('/rpc/2.0/ai_custom/v1/wenxinworkshop/image2text/paddleocr_vl');
    // Body is form-encoded, not JSON, per PaddleOCR-VL contract.
    expect(calls[1]?.contentType).toBe('application/x-www-form-urlencoded');
    expect(calls[1]?.body).toContain('image=');

    expect(result.modelId).toBe('paddleocr_vl');
    expect(result.output).toMatchObject({
      rawText: 'Likes Earl Grey tea',
      fields: [{ name: 'preference.beverage', value: 'Earl Grey tea', confidence: 0.91 }],
      language: 'en',
    });
  });

  it('routes llm.brief to ERNIE 4.5 chat endpoint', async () => {
    const { http, calls } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      {
        statusCode: 200,
        json: {
          result: JSON.stringify({
            items: [{ guestId: 'g1', priority: 'vip', sayThis: 'Welcome', callouts: [] }],
          }),
          usage: { prompt_tokens: 50, completion_tokens: 30 },
        },
      },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    const result = await provider.invoke({
      capability: 'llm.brief',
      tenantId: TENANT_UUID,
      requestId: 'r-2',
      payload: { arrivals: [{ guestId: 'g1', displayName: 'Alice', preferences: [] }] },
    });

    expect(calls[1]?.url).toContain('/wenxinworkshop/chat/ernie-4.5-8k');
    expect(calls[1]?.contentType).toBe('application/json');
    expect(result.modelId).toBe('ernie-4.5-8k');
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(30);
  });

  it('routes llm.reasoning to ERNIE X1', async () => {
    const { http, calls } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      {
        statusCode: 200,
        json: {
          result: 'reasoned answer',
          usage: { prompt_tokens: 100, completion_tokens: 200 },
        },
      },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    const result = await provider.invoke({
      capability: 'llm.reasoning',
      tenantId: TENANT_UUID,
      requestId: 'r-3',
      payload: { prompt: 'Why is this guest a complaint risk?' },
    });

    expect(calls[1]?.url).toContain('/wenxinworkshop/chat/ernie-x1-8k');
    expect(result.modelId).toBe('ernie-x1-8k');
    // X1 should cost more than 4.5: rate is 12/48 vs 8/24 per 1000 tokens.
    // 100*12 + 200*48 = 1200 + 9600 = 10800 → /1000 = 10.8 → round to 11
    expect(result.costMinorUnits).toBe(11);
  });

  it('routes llm.review_link to ERNIE 4.5 with low temperature', async () => {
    const { http, calls } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      {
        statusCode: 200,
        json: {
          result: JSON.stringify({ linkedGuestId: 'g1', confidence: 0.9, reasons: ['name match'] }),
        },
      },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    await provider.invoke({
      capability: 'llm.review_link',
      tenantId: TENANT_UUID,
      requestId: 'r-4',
      payload: { reviewBody: 'Great stay', candidates: [] },
    });

    expect(calls[1]?.url).toContain('/wenxinworkshop/chat/ernie-4.5-8k');
    const body = JSON.parse(calls[1]?.body ?? '{}') as { temperature?: number };
    expect(body.temperature).toBe(0.1); // determinism for entity resolution
  });

  it('normalises PaddleOCR-VL words_result (Shape B) into canonical fields', async () => {
    const { http } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      {
        statusCode: 200,
        json: {
          // Older PaddleOCR shape: line-by-line array with confidence
          words_result: [
            { words: 'Likes Earl Grey tea', probability: { average: 0.93 } },
            { words: 'Two firm pillows', probability: { average: 0.88 } },
          ],
        },
      },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    const result = await provider.invoke({
      capability: 'ocr.card',
      tenantId: TENANT_UUID,
      requestId: 'r-5',
      payload: { imageBase64: 'ZmFrZQ==' },
    });
    const out = result.output as {
      rawText: string;
      fields: Array<{ name: string; value: string; confidence: number }>;
    };
    expect(out.rawText).toBe('Likes Earl Grey tea\nTwo firm pillows');
    expect(out.fields).toHaveLength(2);
    expect(out.fields[0]).toEqual({
      name: 'line_0',
      value: 'Likes Earl Grey tea',
      confidence: 0.93,
    });
  });

  it('throws IntegrationError when ocr.card called without imageBase64', async () => {
    const { http } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    await expect(
      provider.invoke({
        capability: 'ocr.card',
        tenantId: TENANT_UUID,
        requestId: 'r-6',
        payload: { hint: 'no image' },
      }),
    ).rejects.toThrow(IntegrationError);
  });

  it('throws IntegrationError when Qianfan returns error_code', async () => {
    const { http } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      { statusCode: 200, json: { error_code: 17, error_msg: 'daily limit reached' } },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    await expect(
      provider.invoke({
        capability: 'llm.brief',
        tenantId: TENANT_UUID,
        requestId: 'r-7',
        payload: { arrivals: [] },
      }),
    ).rejects.toThrow(IntegrationError);
  });

  it('converts transport errors into ServiceUnavailableError', async () => {
    const failingHttp = vi
      .fn()
      .mockResolvedValueOnce({
        statusCode: 200,
        body: { json: async () => ({ access_token: 'tok-1', expires_in: 3600 }) },
      })
      .mockRejectedValueOnce(new Error('ECONNRESET'));
    const provider = new QianfanProvider({
      ...baseConfig,
      httpRequest: failingHttp as never,
    });
    await expect(
      provider.invoke({
        capability: 'llm.brief',
        tenantId: TENANT_UUID,
        requestId: 'r-8',
        payload: { arrivals: [] },
      }),
    ).rejects.toThrow(ServiceUnavailableError);
  });

  it('reuses the access token across calls until it expires', async () => {
    const { http, calls } = makeFakeHttp([
      { statusCode: 200, json: { access_token: 'tok-1', expires_in: 3600 } },
      { statusCode: 200, json: { result: '{}', usage: { prompt_tokens: 1, completion_tokens: 1 } } },
      { statusCode: 200, json: { result: '{}', usage: { prompt_tokens: 1, completion_tokens: 1 } } },
    ]);
    const provider = new QianfanProvider({ ...baseConfig, httpRequest: http });
    await provider.invoke({
      capability: 'llm.brief',
      tenantId: TENANT_UUID,
      requestId: 'r-9',
      payload: { arrivals: [] },
    });
    await provider.invoke({
      capability: 'llm.brief',
      tenantId: TENANT_UUID,
      requestId: 'r-10',
      payload: { arrivals: [] },
    });
    // 1 token call + 2 chat calls = 3 total. Not 4.
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toContain('/oauth/2.0/token');
  });
});
