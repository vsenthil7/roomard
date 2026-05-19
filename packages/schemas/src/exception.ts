import { z } from 'zod';

import { UuidSchema, IsoDateTimeSchema } from './common.js';

export const ExceptionKindSchema = z.enum([
  'low_confidence_ocr',
  'identity_merge_candidate',
  'preference_conflict',
  'pms_sync_failure',
  'review_link_uncertain',
  'voice_transcription_fail',
  'manual_review',
]);
export type ExceptionKind = z.infer<typeof ExceptionKindSchema>;

export const ExceptionStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'dismissed']);

export const ExceptionQueueItemSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  propertyId: UuidSchema.optional(),
  kind: ExceptionKindSchema,
  status: ExceptionStatusSchema,
  severity: z.number().int().min(1).max(5),
  title: z.string().min(1).max(200),
  description: z.string().max(2000),
  payload: z.record(z.unknown()),
  assignedTo: UuidSchema.optional(),
  guestId: UuidSchema.optional(),
  evidenceId: UuidSchema.optional(),
  createdAt: IsoDateTimeSchema,
  resolvedAt: IsoDateTimeSchema.optional(),
  resolvedBy: UuidSchema.optional(),
  resolutionNotes: z.string().max(2000).optional(),
});
export type ExceptionQueueItem = z.infer<typeof ExceptionQueueItemSchema>;

export const ExceptionPatchRequestSchema = z.object({
  status: ExceptionStatusSchema.optional(),
  assignedTo: UuidSchema.optional().nullable(),
  resolutionNotes: z.string().max(2000).optional(),
  payloadPatch: z.record(z.unknown()).optional(),
});
export type ExceptionPatchRequest = z.infer<typeof ExceptionPatchRequestSchema>;

export const IdentityMergeCandidateSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  guestIdA: UuidSchema,
  guestIdB: UuidSchema,
  confidence: z.number().min(0).max(1),
  reasonCodes: z.array(z.string()),
  status: z.enum(['open', 'merged', 'rejected']),
  createdAt: IsoDateTimeSchema,
});
export type IdentityMergeCandidate = z.infer<typeof IdentityMergeCandidateSchema>;
