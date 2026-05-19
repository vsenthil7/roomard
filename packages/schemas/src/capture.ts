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

export const VoiceMemoCaptureRequestSchema = z.object({
  propertyId: UuidSchema,
  guestId: UuidSchema.optional(),
  metadata: CaptureMetadataSchema,
  transcriptHint: z.string().max(2000).optional(),
});
export type VoiceMemoCaptureRequest = z.infer<typeof VoiceMemoCaptureRequestSchema>;
