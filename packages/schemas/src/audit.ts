import { z } from 'zod';

import { UuidSchema, IsoDateTimeSchema } from './common.js';

export const AuditOperationSchema = z.enum(['create', 'read', 'update', 'delete', 'auth', 'export']);
export const AuditActorKindSchema = z.enum(['user', 'system', 'integration', 'ai']);

export const AuditEventSchema = z.object({
  id: UuidSchema,
  occurredAt: IsoDateTimeSchema,
  tenantId: UuidSchema.optional(),
  actorKind: AuditActorKindSchema,
  actorId: UuidSchema.optional(),
  actorLabel: z.string().max(200).optional(),
  operation: AuditOperationSchema,
  resourceType: z.string().max(64),
  resourceId: z.string().max(128).optional(),
  requestId: z.string().max(128).optional(),
  ipInet: z.string().optional(),
  userAgent: z.string().max(500).optional(),
  dataClass: z.string(),
  payloadHash: z.string(),
  previousHash: z.string().optional(),
  hash: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditQuerySchema = z.object({
  from: IsoDateTimeSchema.optional(),
  to: IsoDateTimeSchema.optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  actorId: UuidSchema.optional(),
  operation: AuditOperationSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditExportRequestSchema = z.object({
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  resourceType: z.string().optional(),
  reason: z.string().min(10).max(500),
});
export type AuditExportRequest = z.infer<typeof AuditExportRequestSchema>;
