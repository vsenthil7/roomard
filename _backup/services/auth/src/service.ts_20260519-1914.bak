import { randomBytes, createHash } from 'node:crypto';

import type { RoomardPool } from '@roomard/db';
import {
  AuthenticationError,
  MfaRequiredError,
  AuthorizationError,
  ConflictError,
} from '@roomard/errors';
import { rolesToPermissions } from '@roomard/service-framework';
import { compare } from 'bcryptjs';
import { SignJWT } from 'jose';
import { authenticator } from 'otplib';

export interface AuthServiceConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  maxFailedLogins: number;
  lockoutDurationSeconds: number;
}

export function authServiceConfigFromEnv(): AuthServiceConfig {
  return {
    jwtSecret:
      process.env.JWT_SECRET ?? 'test-only-do-not-use-in-production-32bytes!',
    issuer: process.env.JWT_ISSUER ?? 'roomard',
    audience: process.env.JWT_AUDIENCE ?? 'roomard',
    accessTokenTtlSeconds: Number.parseInt(process.env.ACCESS_TOKEN_TTL ?? '3600', 10),
    refreshTokenTtlSeconds: Number.parseInt(process.env.REFRESH_TOKEN_TTL ?? '86400', 10),
    maxFailedLogins: Number.parseInt(process.env.MAX_FAILED_LOGINS ?? '5', 10),
    lockoutDurationSeconds: Number.parseInt(process.env.LOCKOUT_DURATION ?? '900', 10),
  };
}

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string | null;
  display_name: string;
  status: string;
  mfa_secret: string | null;
  locked_until: Date | null;
  failed_login_count: number;
}

export interface AuthenticatedSession {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export class AuthService {
  constructor(
    private readonly pool: RoomardPool,
    private readonly cfg: AuthServiceConfig,
  ) {}

  async passwordLogin(input: {
    email: string;
    password: string;
    tenantSlug?: string;
  }): Promise<
    | { status: 'mfa_required'; mfaToken: string }
    | {
        status: 'success';
        session: AuthenticatedSession;
        tokens: {
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresAt: string;
          refreshTokenExpiresAt: string;
        };
      }
  > {
    const user = await this.lookupUser(input.email, input.tenantSlug);
    if (!user) {
      throw new AuthenticationError('invalid credentials');
    }
    if (user.status !== 'active') {
      throw new AuthenticationError('account not active', { status: user.status });
    }
    if (user.locked_until && user.locked_until > new Date()) {
      throw new AuthenticationError('account temporarily locked', {
        until: user.locked_until.toISOString(),
      });
    }
    if (!user.password_hash) {
      throw new AuthenticationError('password login not enabled for this user');
    }
    const ok = await compare(input.password, user.password_hash);
    if (!ok) {
      await this.recordFailedLogin(user);
      throw new AuthenticationError('invalid credentials');
    }
    await this.clearFailedLogins(user.id);

    if (user.mfa_secret) {
      const mfaToken = await this.mintMfaToken(user.id, user.tenant_id);
      return { status: 'mfa_required', mfaToken };
    }
    const session = await this.buildSession(user);
    const tokens = await this.issueTokens(session);
    return { status: 'success', session, tokens };
  }

  async verifyMfa(input: { mfaToken: string; code: string }): Promise<{
    session: AuthenticatedSession;
    tokens: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    };
  }> {
    const { userId, tenantId } = await this.verifyMfaToken(input.mfaToken);
    const user = await this.lookupUserById(userId);
    if (!user || user.tenant_id !== tenantId) {
      throw new AuthenticationError('mfa session invalid');
    }
    if (!user.mfa_secret) {
      throw new AuthenticationError('MFA not enrolled');
    }
    const ok = authenticator.verify({ token: input.code, secret: user.mfa_secret });
    if (!ok) {
      throw new AuthenticationError('invalid MFA code');
    }
    const session = await this.buildSession(user);
    const tokens = await this.issueTokens(session);
    return { session, tokens };
  }

  async refresh(refreshToken: string): Promise<{
    session: AuthenticatedSession;
    tokens: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
    };
  }> {
    const tokenHash = hashToken(refreshToken);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{
        id: string;
        user_id: string;
        tenant_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by: string | null;
      }>(
        `SELECT id, user_id, tenant_id, expires_at, revoked_at, replaced_by
         FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) throw new AuthenticationError('refresh token not found');
      if (row.revoked_at) {
        // Re-use of revoked token = compromise; revoke the whole chain.
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.user_id],
        );
        await client.query('COMMIT');
        throw new AuthenticationError('refresh token re-use detected; all sessions revoked');
      }
      if (row.expires_at < new Date()) throw new AuthenticationError('refresh token expired');

      // Rotate
      const user = await this.lookupUserById(row.user_id);
      if (!user || user.status !== 'active') {
        throw new AuthenticationError('user not active');
      }
      const session = await this.buildSession(user);
      const tokens = await this.issueTokensWithinTx(client, session, row.id);
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = (
           SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND id != $2 ORDER BY issued_at DESC LIMIT 1
         ) WHERE id = $2`,
        [row.user_id, row.id],
      );
      await client.query('COMMIT');
      return { session, tokens };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async logout(refreshToken: string | undefined, allDevices: boolean, userId: string): Promise<void> {
    if (allDevices) {
      await this.pool.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      return;
    }
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await this.pool.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
    }
  }

  async me(userId: string): Promise<AuthenticatedSession & { tenantSlug: string; mfaEnrolled: boolean }> {
    const user = await this.lookupUserById(userId);
    if (!user) throw new AuthenticationError('user not found');
    const session = await this.buildSession(user);
    const { rows } = await this.pool.query<{ slug: string }>(
      `SELECT slug FROM tenants WHERE id = $1`,
      [user.tenant_id],
    );
    return {
      ...session,
      tenantSlug: rows[0]?.slug ?? '',
      mfaEnrolled: user.mfa_secret !== null,
    };
  }

  private async lookupUser(email: string, tenantSlug?: string): Promise<UserRow | null> {
    const emailLower = email.toLowerCase();
    if (tenantSlug) {
      const { rows } = await this.pool.query<UserRow>(
        `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.display_name, u.status,
                u.mfa_secret, u.locked_until, u.failed_login_count
         FROM users u
         INNER JOIN tenants t ON t.id = u.tenant_id
         WHERE u.email_lower = $1 AND t.slug = $2`,
        [emailLower, tenantSlug],
      );
      return rows[0] ?? null;
    }
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, email, password_hash, display_name, status,
              mfa_secret, locked_until, failed_login_count
       FROM users WHERE email_lower = $1`,
      [emailLower],
    );
    if (rows.length > 1) {
      throw new ConflictError('email exists in multiple tenants; specify tenantSlug');
    }
    return rows[0] ?? null;
  }

  private async lookupUserById(id: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, tenant_id, email, password_hash, display_name, status,
              mfa_secret, locked_until, failed_login_count
       FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async recordFailedLogin(user: UserRow): Promise<void> {
    const failed = user.failed_login_count + 1;
    const lockUntil =
      failed >= this.cfg.maxFailedLogins
        ? new Date(Date.now() + this.cfg.lockoutDurationSeconds * 1000)
        : null;
    await this.pool.query(
      `UPDATE users SET failed_login_count = $2, locked_until = $3 WHERE id = $1`,
      [user.id, failed, lockUntil],
    );
  }

  private async clearFailedLogins(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [userId],
    );
  }

  private async buildSession(user: UserRow): Promise<AuthenticatedSession> {
    const { rows: roleRows } = await this.pool.query<{ name: string; permissions: string[] }>(
      `SELECT r.name,
              COALESCE((SELECT array_agg(p) FROM jsonb_array_elements_text(r.permissions::jsonb) AS p), ARRAY[]::text[]) AS permissions
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND (r.tenant_id = $2 OR r.tenant_id IS NULL)`,
      [user.id, user.tenant_id],
    );
    const roleNames = roleRows.map((r) => r.name);
    // Union all explicit permissions from roles + fallback static mapping
    const perms = new Set<string>(rolesToPermissions(roleNames));
    for (const r of roleRows) for (const p of r.permissions) perms.add(p);
    return {
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      displayName: user.display_name,
      roles: roleNames,
      permissions: [...perms],
    };
  }

  private async issueTokens(session: AuthenticatedSession): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tokens = await this.issueTokensWithinTx(client, session, null);
      await client.query('COMMIT');
      return tokens;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async issueTokensWithinTx(
    client: import('pg').PoolClient,
    session: AuthenticatedSession,
    _replacesId: string | null,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
  }> {
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + this.cfg.accessTokenTtlSeconds * 1000);
    const refreshExpiresAt = new Date(now.getTime() + this.cfg.refreshTokenTtlSeconds * 1000);
    const secret = new TextEncoder().encode(this.cfg.jwtSecret);
    const accessToken = await new SignJWT({
      tid: session.tenantId,
      roles: session.roles,
      perms: session.permissions,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(session.userId)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setIssuer(this.cfg.issuer)
      .setAudience(this.cfg.audience)
      .setExpirationTime(Math.floor(accessExpiresAt.getTime() / 1000))
      .sign(secret);

    const refreshToken = `rt_${randomBytes(32).toString('base64url')}`;
    const refreshHash = hashToken(refreshToken);
    await client.query(
      `INSERT INTO refresh_tokens (id, tenant_id, user_id, token_hash, issued_at, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [session.tenantId, session.userId, refreshHash, now.toISOString(), refreshExpiresAt.toISOString()],
    );
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: accessExpiresAt.toISOString(),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private async mintMfaToken(userId: string, tenantId: string): Promise<string> {
    const secret = new TextEncoder().encode(this.cfg.jwtSecret);
    return await new SignJWT({ tid: tenantId, purpose: 'mfa' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer(this.cfg.issuer)
      .setAudience(this.cfg.audience)
      .setExpirationTime('5m')
      .sign(secret);
  }

  private async verifyMfaToken(token: string): Promise<{ userId: string; tenantId: string }> {
    const { jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode(this.cfg.jwtSecret);
    try {
      const { payload } = await jwtVerify(token, secret, {
        issuer: this.cfg.issuer,
        audience: this.cfg.audience,
      });
      if (payload.purpose !== 'mfa') throw new AuthorizationError('not an MFA token');
      return { userId: String(payload.sub), tenantId: String(payload.tid) };
    } catch (err) {
      if (err instanceof AuthorizationError) throw err;
      throw new AuthenticationError('invalid MFA token');
    }
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// re-export for direct use
export { MfaRequiredError };
