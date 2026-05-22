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

  // 3. Insert evidence row in pending state, get id.
  // G-52: real `evidence` columns are object_ref, occurred_at, status, confidence,
  // raw_text, metadata (no content_sha256 / captured_at / capture_surface /
  // source_metadata / model_id / ocr_duration_ms). The sha, surface, notes and
  // OCR model/timing all live in the metadata jsonb.
  const { rows: evRows } = await client.query<{ id: string }>(
    `INSERT INTO evidence (
       id, tenant_id, property_id, guest_id,
       kind, object_ref, occurred_at, status, confidence, metadata
     ) VALUES (
       gen_random_uuid(),
       current_setting('app.tenant_id', false)::uuid,
       $1, $2,
       'card_capture', $3, $4, 'pending', 0, $5::jsonb
     )
     RETURNING id`,
    [
      input.meta.propertyId,
      input.meta.guestId ?? null,
      uri,
      input.meta.metadata.capturedAt,
      JSON.stringify({
        contentSha256: sha256,
        captureSurface: input.meta.metadata.captureSurface,
        notes: input.meta.notes,
        geoHint: input.meta.metadata.geoHint,
      }),
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

  // 5. Update evidence row with raw text + confidence. Real columns only:
  // raw_text, confidence, metadata (model id + ocr timing go into metadata).
  await client.query(
    `UPDATE evidence SET
       raw_text = $1,
       confidence = $2,
       metadata = metadata || $3::jsonb
     WHERE id = $4`,
    [
      ocr.rawText ?? null,
      overall,
      JSON.stringify({ modelId: aiResult.modelId, ocrDurationMs: aiResult.latencyMs }),
      evidenceId,
    ],
  );

  if (overall < ACCEPT_CONFIDENCE) {
    // Low confidence -> exception queue. G-52: evidence_status enum is
    // pending/processed/failed/redacted (no 'pending_review'); leave it 'pending'
    // since a human still needs to review it.
    const { rows: exRows } = await client.query<{ id: string }>(
      // G-52: real exception_kind value is `low_ocr_confidence` (not
      // low_confidence_ocr) and the real column is `detail` (not description).
      `INSERT INTO exception_queue_items (
         id, tenant_id, property_id, kind, status, severity,
         title, detail, payload, evidence_id, guest_id
       ) VALUES (
         gen_random_uuid(),
         current_setting('app.tenant_id', false)::uuid,
         $1, 'low_ocr_confidence', 'open', 3,
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
           confidence, status, metadata, first_observed_at, last_reinforced_at, reinforcement_count
         )
         SELECT
           gen_random_uuid(),
           current_setting('app.tenant_id', false)::uuid,
           $1, $2::preference_kind, $3::preference_polarity, $5,
           $4, 'active', jsonb_build_object('source','card_capture'), now(), now(), 1
         WHERE NOT EXISTS (SELECT 1 FROM upsert)
         RETURNING id`,
        [input.meta.guestId, kind, polarity, f.confidence, f.value],
      );
      const prefId = prefRows[0]?.id;
      if (prefId) {
        await client.query(
          // G-52: preference_evidence requires tenant_id (NOT NULL).
          `INSERT INTO preference_evidence (preference_id, evidence_id, tenant_id, weight)
           VALUES ($1, $2, current_setting('app.tenant_id', false)::uuid, $3)
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

  // G-52: evidence_status enum has no 'accepted'; the processed terminal state
  // is 'processed'.
  await client.query(`UPDATE evidence SET status = 'processed' WHERE id = $1`, [evidenceId]);

  // Also insert the card_captures sub-record. G-52: real columns are
  // evidence_id, tenant_id, image_object_ref, extracted_fields,
  // handwriting_detected (+ optional ocr_language) — not raw_text/fields_json.
  await client.query(
    `INSERT INTO card_captures (
       evidence_id, tenant_id, image_object_ref, extracted_fields,
       handwriting_detected, ocr_language
     )
     VALUES (
       $1, current_setting('app.tenant_id', false)::uuid, $2, $3::jsonb, $4, $5
     )
     ON CONFLICT (evidence_id) DO UPDATE SET
       extracted_fields = EXCLUDED.extracted_fields,
       handwriting_detected = EXCLUDED.handwriting_detected,
       ocr_language = EXCLUDED.ocr_language`,
    [evidenceId, uri, JSON.stringify(fields), true, ocr.language ?? null],
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

// G-52: classifyKind/classifyPolarity must return values that exist in the real
// preference_kind / preference_polarity enums, or the ::enum casts in the INSERT
// throw 22P02. Real preference_kind: pillow, temperature, dietary, allergy,
// room_position, room_type, view, bedding, amenity, service, food_dislike,
// food_like, language, other. Real preference_polarity: likes, dislikes,
// requires, avoids, noted.
function classifyKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('pillow')) return 'pillow';
  if (n.includes('allergy') || n.includes('allergen')) return 'allergy';
  if (n.includes('temperature')) return 'temperature';
  if (n.includes('diet') || n.includes('vegan') || n.includes('vegetarian') || n.includes('halal') || n.includes('kosher'))
    return 'dietary';
  if (n.includes('beverage') || n.includes('drink') || n.includes('tea') || n.includes('coffee') || n.includes('food') || n.includes('meal'))
    return n.includes('dislike') || n.includes('avoid') ? 'food_dislike' : 'food_like';
  if (n.includes('view')) return 'view';
  if (n.includes('bed')) return 'bedding';
  if (n.includes('room') && (n.includes('type') || n.includes('suite'))) return 'room_type';
  if (n.includes('room') || n.includes('floor') || n.includes('quiet') || n.includes('corridor'))
    return 'room_position';
  if (n.includes('amenity') || n.includes('espresso') || n.includes('machine')) return 'amenity';
  if (n.includes('service') || n.includes('turndown') || n.includes('housekeep')) return 'service';
  if (n.includes('language') || n.includes('english') || n.includes('danish') || n.includes('speak'))
    return 'language';
  return 'other';
}

function classifyPolarity(name: string): 'likes' | 'dislikes' | 'requires' | 'avoids' | 'noted' {
  const n = name.toLowerCase();
  if (n.includes('allergy') || n.includes('avoid')) return 'avoids';
  if (n.includes('require') || n.includes('must') || n.includes('need')) return 'requires';
  if (n.includes('dislike')) return 'dislikes';
  if (n.includes('like') || n.includes('prefer') || n.includes('favourite') || n.includes('favorite'))
    return 'likes';
  return 'noted';
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
