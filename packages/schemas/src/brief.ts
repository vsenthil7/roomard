import { z } from 'zod';

import { UuidSchema, IsoDateTimeSchema, ConfidenceSchema } from './common.js';

export const BriefStatusSchema = z.enum(['draft', 'generating', 'ready', 'delivered', 'failed']);
export const BriefItemPrioritySchema = z.enum(['vip', 'attention', 'standard']);

export const BriefItemSchema = z.object({
  id: UuidSchema,
  briefId: UuidSchema,
  guestId: UuidSchema,
  stayId: UuidSchema.optional(),
  priority: BriefItemPrioritySchema,
  displayName: z.string(),
  roomNumber: z.string().optional(),
  arrivalAt: IsoDateTimeSchema.optional(),
  vipReason: z.string().max(280).optional(),
  attentionReason: z.string().max(280).optional(),
  sayThisSuggestion: z.string().max(500).optional(),
  preferenceCallouts: z.array(z.string()),
  recentIssues: z.array(z.string()),
  confidence: ConfidenceSchema,
  position: z.number().int().min(0),
});
export type BriefItem = z.infer<typeof BriefItemSchema>;

export const BriefSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  propertyId: UuidSchema,
  briefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: BriefStatusSchema,
  vipCount: z.number().int().min(0),
  attentionCount: z.number().int().min(0),
  totalArrivals: z.number().int().min(0),
  generatedAt: IsoDateTimeSchema.optional(),
  deliveredAt: IsoDateTimeSchema.optional(),
  generationDurationMs: z.number().int().min(0).optional(),
  promptVersion: z.string().optional(),
  modelId: z.string().optional(),
  items: z.array(BriefItemSchema).optional(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const BriefGenerateRequestSchema = z.object({
  propertyId: UuidSchema,
  briefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  force: z.boolean().optional().default(false),
});
export type BriefGenerateRequest = z.infer<typeof BriefGenerateRequestSchema>;

export const HousekeepingPrepSchema = z.object({
  id: UuidSchema,
  stayId: UuidSchema,
  propertyId: UuidSchema,
  arrivalAt: IsoDateTimeSchema,
  pillowPreference: z.string().optional(),
  temperaturePreference: z.string().optional(),
  allergies: z.array(z.string()),
  amenityRequests: z.array(z.string()),
  notes: z.string().max(1000).optional(),
  status: z.enum(['pending', 'prepared', 'verified']),
  confidence: ConfidenceSchema,
});
export type HousekeepingPrep = z.infer<typeof HousekeepingPrepSchema>;
