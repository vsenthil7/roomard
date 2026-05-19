import { z } from 'zod';

import { EmailSchema, UuidSchema, IsoDateTimeSchema } from './common.js';

export const SsoStartRequestSchema = z.object({
  tenantSlug: z.string().min(1).max(64),
  returnUrl: z.string().url().optional(),
});
export type SsoStartRequest = z.infer<typeof SsoStartRequestSchema>;

export const SsoStartResponseSchema = z.object({
  redirectUrl: z.string().url(),
  state: z.string().min(8),
});

export const PasswordLoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(256),
  tenantSlug: z.string().min(1).max(64).optional(),
});
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;

export const MfaVerifyRequestSchema = z.object({
  mfaToken: z.string().min(16),
  code: z.string().regex(/^\d{6}$/),
});
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: IsoDateTimeSchema,
  refreshTokenExpiresAt: IsoDateTimeSchema,
  tokenType: z.literal('Bearer'),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const LoginResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    tokens: TokenPairSchema,
    user: z.object({
      id: UuidSchema,
      email: EmailSchema,
      displayName: z.string(),
      tenantId: UuidSchema,
      roles: z.array(z.string()),
    }),
  }),
  z.object({
    status: z.literal('mfa_required'),
    mfaToken: z.string().min(16),
  }),
]);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  allDevices: z.boolean().optional().default(false),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const MeResponseSchema = z.object({
  id: UuidSchema,
  email: EmailSchema,
  displayName: z.string(),
  tenantId: UuidSchema,
  tenantSlug: z.string(),
  roles: z.array(
    z.object({
      id: UuidSchema,
      name: z.string(),
      permissions: z.array(z.string()),
    }),
  ),
  properties: z.array(
    z.object({
      id: UuidSchema,
      name: z.string(),
      shortCode: z.string(),
    }),
  ),
  mfaEnrolled: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const SsoCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  SAMLResponse: z.string().optional(),
  RelayState: z.string().optional(),
});
