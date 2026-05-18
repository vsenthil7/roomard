import { ServiceUnavailableError } from '@roomard/errors';
import type { AiCallInput, AiCallResult, AiProvider, Capability } from './types.js';
import { hashPayload } from './types.js';

/**
 * Deterministic in-memory provider. Used when AI_GATEWAY_MOCK=true and in all tests.
 * Outputs are stable for a given input so snapshot tests are reliable.
 */
export class MockAiProvider implements AiProvider {
  private failures = new Set<Capability>();

  /** Force a capability to fail for testing error paths. */
  forceFailure(cap: Capability): void {
    this.failures.add(cap);
  }

  clearFailures(): void {
    this.failures.clear();
  }

  async invoke<T = unknown>(input: AiCallInput): Promise<AiCallResult<T>> {
    if (this.failures.has(input.capability)) {
      throw new ServiceUnavailableError('ai gateway mock forced failure', {
        capability: input.capability,
      });
    }

    const inputHash = hashPayload(input.payload);
    const start = Date.now();

    let output: unknown;
    let modelId: string;
    switch (input.capability) {
      case 'ocr.card':
        output = mockOcr(input.payload);
        modelId = 'paddleocr-vl-mock-1.0';
        break;
      case 'llm.brief':
        output = mockBrief(input.payload);
        modelId = 'ernie-4.5-mock-1.0';
        break;
      case 'llm.review_link':
        output = mockReviewLink(input.payload);
        modelId = 'ernie-4.5-mock-1.0';
        break;
      case 'llm.reasoning':
        output = mockReasoning(input.payload);
        modelId = 'ernie-x1-mock-1.0';
        break;
      default: {
        const _exhaustive: never = input.capability;
        throw new Error(`unsupported capability: ${String(_exhaustive)}`);
      }
    }

    const latencyMs = Math.max(1, Date.now() - start);
    return {
      output: output as T,
      modelId,
      promptVersion: 'mock-1',
      latencyMs,
      inputTokens: estimateTokens(input.payload),
      outputTokens: estimateTokens(output),
      costMinorUnits: 0,
      inputHash,
      outputHash: hashPayload(output),
    };
  }
}

function estimateTokens(value: unknown): number {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(s.length / 4));
}

function mockOcr(payload: unknown): {
  rawText: string;
  fields: Array<{ name: string; value: string; confidence: number }>;
  language: string;
} {
  const p = payload as { imageBase64?: string; hint?: string };
  // Make output dependent on the input length so different calls yield different results
  const seed = p.imageBase64 ? p.imageBase64.length % 100 : 50;
  const conf = 0.7 + (seed % 25) / 100; // 0.70 — 0.94
  return {
    rawText: `Likes Earl Grey tea. Two firm pillows. ${p.hint ?? ''}`.trim(),
    fields: [
      { name: 'preference.food.beverage', value: 'Earl Grey tea', confidence: conf },
      { name: 'preference.room.pillow', value: 'Two firm pillows', confidence: conf - 0.04 },
    ],
    language: 'en',
  };
}

function mockBrief(payload: unknown): {
  items: Array<{
    guestId: string;
    priority: 'vip' | 'attention' | 'standard';
    sayThis: string;
    callouts: string[];
  }>;
} {
  const p = payload as {
    arrivals?: Array<{
      guestId: string;
      displayName: string;
      preferences: string[];
      recentIssues?: string[];
      loyaltyTier?: string;
    }>;
  };
  const arrivals = p.arrivals ?? [];
  return {
    items: arrivals.map((a, idx) => {
      const isVip = a.loyaltyTier === 'platinum' || a.loyaltyTier === 'diamond';
      const hasIssue = (a.recentIssues ?? []).length > 0;
      const priority: 'vip' | 'attention' | 'standard' = isVip
        ? 'vip'
        : hasIssue
          ? 'attention'
          : idx === 0
            ? 'vip'
            : 'standard';
      const callouts = a.preferences.slice(0, 3);
      const sayThis = callouts[0]
        ? `Welcome back ${a.displayName} — we have ${callouts[0]} ready for you.`
        : `Welcome ${a.displayName}.`;
      return { guestId: a.guestId, priority, sayThis, callouts };
    }),
  };
}

function mockReviewLink(payload: unknown): {
  linkedGuestId: string | null;
  confidence: number;
  reasons: string[];
} {
  const p = payload as {
    reviewBody: string;
    candidates?: Array<{ guestId: string; displayName: string; stayDates: string }>;
  };
  const candidates = p.candidates ?? [];
  if (candidates.length === 0) {
    return { linkedGuestId: null, confidence: 0, reasons: ['no candidates supplied'] };
  }
  // Pick the candidate whose displayName appears in the review body, else the first one with mid confidence
  const matched = candidates.find((c) => p.reviewBody.toLowerCase().includes(c.displayName.toLowerCase()));
  if (matched) {
    return {
      linkedGuestId: matched.guestId,
      confidence: 0.88,
      reasons: [`name "${matched.displayName}" appears in review`, 'stay dates align'],
    };
  }
  return {
    linkedGuestId: candidates[0]!.guestId,
    confidence: 0.55,
    reasons: ['no name match — selecting by stay-date proximity only'],
  };
}

function mockReasoning(payload: unknown): { answer: string; reasoning: string[] } {
  const p = payload as { prompt: string };
  return {
    answer: `Mock reasoning answer for: ${p.prompt.slice(0, 60)}`,
    reasoning: [
      'Decomposed problem into steps',
      'Evaluated trade-offs',
      'Selected highest-confidence path',
    ],
  };
}
