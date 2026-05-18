/**
 * Common shared shapes used across multiple resources.
 * Aligned with API Spec §8.
 *
 * Note: Roomard uses camelCase for internal TypeScript types. API Spec snake_case
 * field names are translated at the HTTP boundary by API Gateway middleware.
 */
import { z } from 'zod';

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
export type IsoDate = z.infer<typeof IsoDateSchema>;

export const CurrencyCodeSchema = z
  .string()
  .length(3)
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'must be ISO 4217 alpha-3'));
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const CountryCodeSchema = z
  .string()
  .length(2)
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{2}$/, 'must be ISO 3166-1 alpha-2'));
export type CountryCode = z.infer<typeof CountryCodeSchema>;

export const EmailSchema = z
  .string()
  .email()
  .max(320)
  .transform((v) => v.toLowerCase());
export type Email = z.infer<typeof EmailSchema>;

export const PhoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'must be E.164 format');
export type PhoneE164 = z.infer<typeof PhoneE164Schema>;

/** Money shape per API Spec §8.1 — minor units. */
export const MoneySchema = z.object({
  amount: z.number().int(),
  currency: CurrencyCodeSchema,
  scale: z.number().int().min(0).max(8),
});
export type Money = z.infer<typeof MoneySchema>;

/** Confidence shape per API Spec §8.2. */
export const ConfidenceSchema = z.object({
  value: z.number().min(0).max(1),
  calibration: z.string(),
});
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Address shape per API Spec §8.3. */
export const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().nullable(),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  countryCode: CountryCodeSchema,
});
export type Address = z.infer<typeof AddressSchema>;

/** AuditableMeta shape per API Spec §8.4. */
export const ActorRefSchema = z.object({
  id: UuidSchema,
  displayName: z.string(),
});
export type ActorRef = z.infer<typeof ActorRefSchema>;

export const AuditableMetaSchema = z.object({
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  createdBy: ActorRefSchema.nullable().optional(),
  updatedBy: ActorRefSchema.nullable().optional(),
});
export type AuditableMeta = z.infer<typeof AuditableMetaSchema>;

/** EvidenceRef shape per API Spec §8.5. */
export const EvidenceKindSchema = z.enum([
  'card_capture',
  'voice_memo',
  'fb_ticket',
  'review',
  'email',
  'manual',
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EvidenceRefSchema = z.object({
  id: UuidSchema,
  kind: EvidenceKindSchema,
  occurredAt: IsoDateTimeSchema,
  preview: z.string().nullable().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

/** Pagination cursor envelope per API Spec §4.4. */
export const PageMetaSchema = z.object({
  size: z.number().int().min(0),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type PageMeta = z.infer<typeof PageMetaSchema>;

/** Generic paged collection. */
export function pagedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: PageMetaSchema,
  });
}

/** Standard error response shape per API Spec §5. */
export const ErrorDetailSchema = z.object({
  field: z.string().optional(),
  reason: z.string().optional(),
  hint: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(ErrorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
