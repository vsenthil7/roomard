import { z } from 'zod';
import {
  UuidSchema,
  EmailSchema,
  PhoneE164Schema,
  CountryCodeSchema,
  IsoDateTimeSchema,
  ConfidenceSchema,
  pagedSchema,
} from './common.js';

export const PreferenceKindSchema = z.enum([
  'food',
  'beverage',
  'allergy',
  'room',
  'pillow',
  'temperature',
  'activity',
  'celebration',
  'communication',
  'accessibility',
  'family',
  'pet',
  'other',
]);
export type PreferenceKind = z.infer<typeof PreferenceKindSchema>;

export const PreferencePolaritySchema = z.enum(['like', 'dislike', 'allergy', 'requirement']);
export type PreferencePolarity = z.infer<typeof PreferencePolaritySchema>;

export const PreferenceStatusSchema = z.enum(['active', 'superseded', 'retracted']);

export const PreferenceSchema = z.object({
  id: UuidSchema,
  guestId: UuidSchema,
  kind: PreferenceKindSchema,
  polarity: PreferencePolaritySchema,
  detail: z.string().min(1).max(500),
  confidence: ConfidenceSchema,
  status: PreferenceStatusSchema,
  source: z.string().max(64),
  firstObservedAt: IsoDateTimeSchema,
  lastReinforcedAt: IsoDateTimeSchema,
  reinforcementCount: z.number().int().min(1),
  evidenceIds: z.array(UuidSchema),
  supersedesId: UuidSchema.optional(),
});
export type Preference = z.infer<typeof PreferenceSchema>;

export const GuestSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  displayName: z.string().min(1).max(200),
  email: EmailSchema.optional(),
  phoneE164: PhoneE164Schema.optional(),
  homeCountryCode: CountryCodeSchema.optional(),
  nameVariants: z.array(z.string()).default([]),
  loyaltyTiers: z.record(z.string()).default({}),
  attentionFlags: z.array(z.string()).default([]),
  processingRestrictions: z.array(z.string()).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Guest = z.infer<typeof GuestSchema>;

export const GuestCreateRequestSchema = z.object({
  displayName: z.string().min(1).max(200),
  email: EmailSchema.optional(),
  phoneE164: PhoneE164Schema.optional(),
  homeCountryCode: CountryCodeSchema.optional(),
  nameVariants: z.array(z.string()).max(20).optional(),
  attentionFlags: z.array(z.string()).max(10).optional(),
  pmsGuestIds: z.record(z.string()).optional(),
});
export type GuestCreateRequest = z.infer<typeof GuestCreateRequestSchema>;

export const GuestPatchRequestSchema = GuestCreateRequestSchema.partial();
export type GuestPatchRequest = z.infer<typeof GuestPatchRequestSchema>;

export const GuestSearchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  email: EmailSchema.optional(),
  phone: PhoneE164Schema.optional(),
  arrivingOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  propertyId: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});
export type GuestSearchQuery = z.infer<typeof GuestSearchQuerySchema>;

export const GuestSearchResultSchema = pagedSchema(
  GuestSchema.extend({
    matchScore: z.number().min(0).max(1).optional(),
    activePreferenceCount: z.number().int().min(0),
    upcomingArrivalAt: IsoDateTimeSchema.optional(),
  }),
);

export const SayThisSuggestionSchema = z.object({
  guestId: UuidSchema,
  greeting: z.string().min(1).max(200),
  context: z.string().min(1).max(500),
  preferenceCallouts: z.array(z.string()),
  generatedAt: IsoDateTimeSchema,
  promptVersion: z.string(),
  modelId: z.string(),
});
export type SayThisSuggestion = z.infer<typeof SayThisSuggestionSchema>;
