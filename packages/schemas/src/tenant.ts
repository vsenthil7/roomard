import { z } from 'zod';
import { UuidSchema, IsoDateTimeSchema } from './common.js';

export const TenantTierSchema = z.enum(['starter', 'growth', 'enterprise']);
export const TenantStatusSchema = z.enum(['active', 'suspended', 'archived']);
export const DataResidencySchema = z.enum(['eu', 'us', 'apac', 'cn']);
export const SsoProtocolSchema = z.enum(['saml', 'oidc', 'password']);

export const TenantSchema = z.object({
  id: UuidSchema,
  slug: z.string().min(2).max(64),
  legalName: z.string().max(200),
  tier: TenantTierSchema,
  status: TenantStatusSchema,
  dataResidency: DataResidencySchema,
  createdAt: IsoDateTimeSchema,
  metadata: z.record(z.unknown()).default({}),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const PropertySchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: z.string().min(1).max(200),
  shortCode: z.string().min(1).max(16),
  timezone: z.string().min(1).max(64),
  locale: z.string().min(2).max(16),
  addressJson: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'inactive']),
});
export type Property = z.infer<typeof PropertySchema>;

export const TenantSsoConfigSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  protocol: SsoProtocolSchema,
  metadata: z.record(z.unknown()),
  enabled: z.boolean(),
});

export const PropertyCreateRequestSchema = z.object({
  name: z.string().min(1).max(200),
  shortCode: z.string().min(1).max(16).regex(/^[A-Z0-9_-]+$/),
  timezone: z.string().min(1).max(64),
  locale: z.string().min(2).max(16).optional(),
  addressJson: z.record(z.unknown()).optional(),
});
export type PropertyCreateRequest = z.infer<typeof PropertyCreateRequestSchema>;

export const RoleSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema.nullable(),
  name: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string()),
  dataClasses: z.array(z.string()),
  isSystem: z.boolean(),
});
export type Role = z.infer<typeof RoleSchema>;
