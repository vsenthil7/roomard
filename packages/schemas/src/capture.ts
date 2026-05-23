import { z } from 'zod';

import { UuidSchema, IsoDateTimeSchema, ConfidenceSchema, EvidenceKindSchema } from './common.js';

export const CaptureMetadataSchema = z.object({
  capturedAt: IsoDateTimeSchema,
  deviceId: z.string().max(128).optional(),
  geoHint: z.string().max(64).optional(),
  captureSurface: z.enum(['mobile_camera', 'mobile_gallery', 'web_upload', 'integration']),
});
export type CaptureMetadata = z.infer<typeof CaptureMetadataSchema>;

export const CardCaptureRequestSchema = z.object({
  propertyId: UuidSchema,
  guestId: UuidSchema.optional(),
  stayId: UuidSchema.optional(),
  metadata: CaptureMetadataSchema,
  notes: z.string().max(2000).optional(),
});
export type CardCaptureRequest = z.infer<typeof CardCaptureRequestSchema>;

export const OcrFieldSchema = z.object({
  name: z.string(),
  value: z.string(),
  confidence: z.number().min(0).max(1),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
    })
    .optional(),
});
export type OcrField = z.infer<typeof OcrFieldSchema>;

export const OcrResultSchema = z.object({
  rawText: z.string(),
  fields: z.array(OcrFieldSchema),
  language: z.string().min(2).max(8).optional(),
  modelId: z.string(),
  durationMs: z.number().int().min(0),
});
export type OcrResult = z.infer<typeof OcrResultSchema>;

export const CaptureResponseSchema = z.object({
  evidenceId: UuidSchema,
  kind: EvidenceKindSchema,
  status: z.enum(['accepted', 'pending_review', 'rejected']),
  confidence: ConfidenceSchema,
  extractedPreferences: z.array(
    z.object({
      kind: z.string(),
      polarity: z.string(),
      detail: z.string(),
      confidence: z.number().min(0).max(1),
      preferenceId: UuidSchema.optional(),
    }),
  ),
  exceptionQueueItemId: UuidSchema.optional(),
  createdAt: IsoDateTimeSchema,
});
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;

// ---------------------------------------------------------------------------
// OCR field -> preference classification (single source of truth).
//
// These map a raw OCR field name to the real preference_kind / preference_polarity
// enum values. Both the capture pipeline (high-confidence auto-persist) and the
// exception service (persist-on-resolve for low-confidence cards that a human has
// confirmed) use these, so the two paths can never drift apart.
//
// Real preference_kind: pillow, temperature, dietary, allergy, room_position,
// room_type, view, bedding, amenity, service, food_dislike, food_like, language,
// other. Real preference_polarity (DB enum): likes, dislikes, requires, avoids,
// noted. NB: this DB enum differs from the API-level PreferencePolaritySchema in
// guest.ts; these classifiers target the DB enum used by the ::preference_polarity
// casts in the capture + exception persist paths.
// ---------------------------------------------------------------------------
export type DbPreferencePolarity = 'likes' | 'dislikes' | 'requires' | 'avoids' | 'noted';

export function classifyPreferenceKind(name: string): string {
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

export function classifyPreferencePolarity(name: string): DbPreferencePolarity {
  const n = name.toLowerCase();
  if (n.includes('allergy') || n.includes('avoid')) return 'avoids';
  if (n.includes('require') || n.includes('must') || n.includes('need')) return 'requires';
  if (n.includes('dislike')) return 'dislikes';
  if (n.includes('like') || n.includes('prefer') || n.includes('favourite') || n.includes('favorite'))
    return 'likes';
  return 'noted';
}

export const VoiceMemoCaptureRequestSchema = z.object({
  propertyId: UuidSchema,
  guestId: UuidSchema.optional(),
  metadata: CaptureMetadataSchema,
  transcriptHint: z.string().max(2000).optional(),
});
export type VoiceMemoCaptureRequest = z.infer<typeof VoiceMemoCaptureRequestSchema>;
