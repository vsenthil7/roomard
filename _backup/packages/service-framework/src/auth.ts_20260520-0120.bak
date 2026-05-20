import { AuthenticationError, AuthorizationError } from '@roomard/errors';
import { jwtVerify } from 'jose';

export interface AuthPrincipal {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: Set<string>;
  /** True if the JWT was issued after a fresh MFA assertion. Defaults false. */
  mfaVerified: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
}

export function authConfigFromEnv(): AuthConfig {
  return {
    jwtSecret:
      process.env.JWT_SECRET ?? 'test-only-do-not-use-in-production-32bytes!',
    issuer: process.env.JWT_ISSUER ?? 'roomard',
    audience: process.env.JWT_AUDIENCE ?? 'roomard',
  };
}

export async function verifyAccessToken(
  token: string,
  cfg: AuthConfig,
): Promise<AuthPrincipal> {
  if (!token) {
    throw new AuthenticationError('missing access token');
  }
  const secret = new TextEncoder().encode(cfg.jwtSecret);
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: [cfg.issuer, 'roomard-test'],
      audience: cfg.audience,
    });
    const roles = Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
    const perms = Array.isArray(payload.perms)
      ? (payload.perms as string[])
      : rolesToPermissions(roles);
    return {
      userId: String(payload.sub),
      tenantId: String(payload.tid),
      roles,
      permissions: new Set(perms),
      mfaVerified: Boolean(payload.mfa),
    };
  } catch (err) {
    throw new AuthenticationError('invalid or expired access token', {
      reason: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Static role → permissions map. In production, permissions come from the
 * `roles` table via the auth service and are embedded in the token at login time;
 * this fallback is for tokens that only carry role names.
 */
export function rolesToPermissions(roles: string[]): string[] {
  const map: Record<string, string[]> = {
    admin: ['*'],
    gm: [
      'tenant.read',
      'property.read',
      'property.write',
      'guest.read',
      'guest.write',
      'preference.read',
      'preference.write',
      'capture.read',
      'capture.write',
      'brief.read',
      'brief.write',
      'exception.read',
      'exception.write',
      'review.read',
      'review.write',
      'audit.read',
      'integration.read',
    ],
    front_desk_manager: [
      'guest.read',
      'guest.write',
      'preference.read',
      'preference.write',
      'capture.read',
      'capture.write',
      'brief.read',
      'brief.write',
      'exception.read',
      'exception.write',
      'review.read',
      'review.write',
    ],
    front_desk_agent: [
      'guest.read',
      'preference.read',
      'capture.read',
      'capture.write',
      'brief.read',
    ],
    concierge: [
      'guest.read',
      'preference.read',
      'preference.write',
      'capture.read',
      'capture.write',
      'brief.read',
    ],
    dpo: ['guest.read', 'audit.read', 'preference.read', 'data_subject.export', 'data_subject.delete'],
  };
  const result = new Set<string>();
  for (const r of roles) {
    for (const p of map[r] ?? []) result.add(p);
  }
  return [...result];
}

export function hasPermission(principal: AuthPrincipal, perm: string): boolean {
  if (principal.permissions.has('*')) return true;
  if (principal.permissions.has(perm)) return true;
  // Wildcard suffix: "guest.*" grants "guest.read"
  const dot = perm.indexOf('.');
  if (dot >= 0) {
    const prefix = perm.slice(0, dot) + '.*';
    if (principal.permissions.has(prefix)) return true;
  }
  return false;
}

export function requirePermission(principal: AuthPrincipal, perm: string): void {
  if (!hasPermission(principal, perm)) {
    throw new AuthorizationError(`permission ${perm} required`);
  }
}
