import { z } from 'zod';
import { UuidSchema, IsoDateTimeSchema } from './common.js';

export const ReviewSourceSchema = z.enum([
  'tripadvisor',
  'booking_com',
  'google',
  'expedia',
  'direct_feedback',
  'other',
]);
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;

export const ReviewLinkStatusSchema = z.enum(['unlinked', 'linked', 'rejected', 'manual']);

export const ReviewSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  propertyId: UuidSchema,
  source: ReviewSourceSchema,
  externalId: z.string().max(256),
  postedAt: IsoDateTimeSchema,
  rating: z.number().min(0).max(10).optional(),
  title: z.string().max(500).optional(),
  body: z.string().max(10000),
  language: z.string().min(2).max(8).optional(),
  authorAlias: z.string().max(200).optional(),
  sentiment: z.number().min(-1).max(1).optional(),
  topics: z.array(z.string()).default([]),
  namedStaff: z.array(z.string()).default([]),
  linkedGuestId: UuidSchema.optional(),
  linkedStayId: UuidSchema.optional(),
  linkStatus: ReviewLinkStatusSchema,
  linkConfidence: z.number().min(0).max(1).optional(),
  linkReasons: z.array(z.string()).default([]),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ReviewLinkRequestSchema = z.object({
  guestId: UuidSchema,
  stayId: UuidSchema.optional(),
  reasonNotes: z.string().max(1000).optional(),
});
export type ReviewLinkRequest = z.infer<typeof ReviewLinkRequestSchema>;
