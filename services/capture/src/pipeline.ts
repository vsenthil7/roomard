/**
 * Capture pipeline — the magic-moment flow (UC-02).
 * 1. Upload image to object store
 * 2. Create evidence row (status=pending)
 * 3. Call AI Gateway → ocr.card
 * 4. If overall confidence ≥ 0.75 → extract preferences, upsert into preferences,
 *    link via preference_evidence, mark evidence accepted.
 * 5. If < 0.75 → write exception_queue_items row; evidence status=pending_review.
 */
import { NotFoundError } from '@roomard/errors';
import { createLogger } from '@roomard/logger';
import type {
  CardCaptureRequest,
  CaptureResponse,
  CaptureMetadata,
} from '@roomard/schemas';
import type { PoolClient } from 'pg';

import type { AnyObjectStore } from './object-store.js';

const log = createLogger({ name: 'capture.pipeline' });

const ACCEPT_CONFIDENCE = 0.75;

export interface PipelineDeps {
  objectStore: AnyObjectStore;
  aiInvoke(input: {
    capability: 'ocr.card';
    tenantId: string;
    requestId: string;
    payload: unknown;
  }): Promise<{
    output: unknown;
    modelId: string;
    latencyMs: number;
  }>;
}

export interface PipelineInput {
  meta: CardCaptureRequest;
  fileBuffer: Buffer;
  contentType: string;
  tenantId: string;
  requestId: string;
  userId: string;
}

interface OcrField {
  name: string;
  value: string;
  confidence: number;
}

export async function processCardCapture(
  client: PoolClient,
  deps: PipelineDeps,
  input: PipelineInput,
): Promise<CaptureResponse> {
  // 1. Validate property exists (RLS will already filter cross-tenant)
  const { rows: propRows } = await client.query<{ id: string }>(
    `SELECT id FROM properties WHERE id = $1`,
    [input.meta.propertyId],
  );
  if (propRows.length === 0) throw new NotFoundError('property not found');

  if (input.meta.guestId) {
    const { rows: gRows } = await client.query<{ id: string }>(
      `SELECT id FROM guests WHERE id = $1`,
      [input.meta.guestId],
    );
    if (gRows.length === 0) throw new NotFoundError('guest not found');
  }

  // 2. Persist blob
  const ext = guessExtension(input.contentType);
  const objectKey = `tenants/${input.tenantId}/captures/${new Date().toISOString().slice(0, 10)}/${input.requestId}${ext}`;
  const { uri, sha256 } = await deps.objectStore.put(objectKey, input.fileBuffer, input.contentType);

  // 3. Insert evidence row in pending state, get id
  const { rows: evRows } = await client.query<{ id: string }>(
    `INSERT INTO evidence (
       id, tenant_id, property_id, guest_id,
       kind, object_ref, content_sha256, captured_at, status, confidence,
       capture_surface, source_metadata
     ) VALUES (
       gen_random_uuid(),
       current_setting('app.tenant_id', false)::uuid,
       $1, $2,
       'card_capture', $3, $4, $5,
       'pending', 0,
       $6, $7::jsonb
     )
     RETURNING id`,
    [
      input.meta.propertyId,
      input.meta.guestId ?? null,
      uri,
      sha256,
      input.meta.metadata.capturedAt,
      input.meta.metadata.captureSurface,
      JSON.stringify({ notes: input.meta.notes, geoHint: input.meta.metadata.geoHint }),
    ],
  );
  const evidenceId = evRows[0]!.id;

  // 4. Call OCR
  const aiResult = await deps.aiInvoke({
    capability: 'ocr.card',
    tenantId: input.tenantId,
    requestId: input.requestId,
    payload: { imageBase64: input.fileBuffer.toString('base64'), hint: input.meta.notes },
  });
  const ocr = aiResult.output as {
    rawText?: string;
    fields?: OcrField[];
    language?: string;
  };
  const fields = ocr.fields ?? [];
  const overall = aggregateConfidence(fields);

  log.info(
    { evidenceId, fieldCount: fields.length, overall, modelId: aiResult.modelId },
    'ocr result',
  );

  // 5. Update evidence row with raw text + confidence
  await client.query(
    `UPDATE evidence SET
       raw_text = $1,
       confidence = $2,
       model_id = $3,
       ocr_duration_ms = $4
     WHERE id = $5`,
    [ocr.rawText ?? null, overall, aiResult.modelId, aiResult.latencyMs, evidenceId],
  );

  if (overall < ACCEPT_CONFIDENCE) {
    // Low confidence → exception queue, evidence stays pending_review
    await client.query(
      `UPDATE evidence SET status = 'pending_review' WHERE id = $1`,
      [evidenceId],
    );
    const { rows: exRows } = await client.query<{ id: string }>(
      `INSERT INTO exception_queue_items (
         id, tenant_id, property_id, kind, status, severity,
         title, description, payload, evidence_id, guest_id
       ) VALUES (
         gen_random_uuid(),
         current_setting('app.tenant_id', false)::uuid,
         $1, 'low_confidence_ocr', 'open', 3,
         'OCR result below confidence threshold',
         $2, $3::jsonb, $4, $5
       ) RETURNING id`,
      [
        input.meta.propertyId,
        `Confidence ${(overall * 100).toFixed(0)}% — needs human review`,
        JSON.stringify({ overall, fields }),
        evidenceId,
        input.meta.guestId ?? null,
      ],
    );

    return {
      evidenceId,
      kind: 'card_capture',
      status: 'pending_review',
      confidence: { value: overall, calibration: 'ocr-aggregate' },
      extractedPreferences: fields.map((f) => ({
        kind: classifyKind(f.name),
        polarity: classifyPolarity(f.name),
        detail: f.value,
        confidence: f.confidence,
      })),
      exceptionQueueItemId: exRows[0]!.id,
      createdAt: new Date().toISOString(),
    };
  }

  // 6. High confidence — extract preferences, link evidence
  const extracted: CaptureResponse['extractedPreferences'] = [];
  if (input.meta.guestId) {
    for (const f of fields) {
      const kind = classifyKind(f.name);
      const polarity = classifyPolarity(f.name);
      const { rows: prefRows } = await client.query<{ id: string }>(
        `WITH upsert AS (
           UPDATE preferences SET
             confidence = GREATEST(confidence, $4),
             reinforcement_count = reinforcement_count + 1,
             last_reinforced_at = now()
           WHERE guest_id = $1 AND kind = $2::preference_kind AND lower(detail) = lower($5) AND status = 'active'
           RETURNING id
         )
         INSERT INTO preferences (
           id, tenant_id, guest_id, kind, polarity, detail,
           confidence, confidence_calibration, status, source, first_observed_at, last_reinforced_at, reinforcement_count
         )
         SELECT
           gen_random_uuid(),
           current_setting('app.tenant_id', false)::uuid,
           $1, $2::preference_kind, $3::preference_polarity, $5,
           $4, 'ocr', 'active', 'card_capture', now(), now(), 1
         WHERE NOT EXISTS (SELECT 1 FROM upsert)
         RETURNING id`,
        [input.meta.guestId, kind, polarity, f.confidence, f.value],
      );
      const prefId = prefRows[0]?.id;
      if (prefId) {
        await client.query(
          `INSERT INTO preference_evidence (preference_id, evidence_id, weight)
           VALUES ($1, $2, $3)
           ON CONFLICT (preference_id, evidence_id) DO NOTHING`,
          [prefId, evidenceId, f.confidence],
        );
      }
      extracted.push({
        kind,
        polarity,
        detail: f.value,
        confidence: f.confidence,
        preferenceId: prefId,
      });
    }
  }

  await client.query(`UPDATE evidence SET status = 'accepted' WHERE id = $1`, [evidenceId]);

  // Also insert card_captures sub-record
  await client.query(
    `INSERT INTO card_captures (evidence_id, raw_text, fields_json, language)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (evidence_id) DO UPDATE SET raw_text = EXCLUDED.raw_text, fields_json = EXCLUDED.fields_json`,
    [evidenceId, ocr.rawText ?? null, JSON.stringify(fields), ocr.language ?? null],
  );

  return {
    evidenceId,
    kind: 'card_capture',
    status: 'accepted',
    confidence: { value: overall, calibration: 'ocr-aggregate' },
    extractedPreferences: extracted,
    createdAt: new Date().toISOString(),
  };
}

function aggregateConfidence(fields: OcrField[]): number {
  if (fields.length === 0) return 0;
  // Min across fields — a single shaky field drops the whole capture into review.
  return Math.min(...fields.map((f) => f.confidence));
}

function classifyKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('pillow')) return 'pillow';
  if (n.includes('allergy') || n.includes('allergen')) return 'allergy';
  if (n.includes('temperature')) return 'temperature';
  if (n.includes('beverage') || n.includes('drink') || n.includes('tea') || n.includes('coffee'))
    return 'beverage';
  if (n.includes('food')) return 'food';
  if (n.includes('room')) return 'room';
  if (n.includes('activity')) return 'activity';
  if (n.includes('celebration') || n.includes('birthday') || n.includes('anniversary'))
    return 'celebration';
  if (n.includes('accessibility')) return 'accessibility';
  if (n.includes('family') || n.includes('child')) return 'family';
  if (n.includes('pet')) return 'pet';
  return 'other';
}

function classifyPolarity(name: string): 'like' | 'dislike' | 'allergy' | 'requirement' {
  const n = name.toLowerCase();
  if (n.includes('allergy')) return 'allergy';
  if (n.includes('require') || n.includes('must') || n.includes('need')) return 'requirement';
  if (n.includes('dislike') || n.includes('avoid')) return 'dislike';
  return 'like';
}

function guessExtension(contentType: string): string {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return '.jpg';
  if (contentType === 'image/png') return '.png';
  if (contentType === 'image/webp') return '.webp';
  if (contentType === 'application/pdf') return '.pdf';
  return '.bin';
}

export { ACCEPT_CONFIDENCE };
export type { CaptureMetadata };
