import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import {
  PasswordLoginRequestSchema,
  MfaVerifyRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  type LoginResponse,
  type MeResponse,
} from '@roomard/schemas';
import { applyFramework, authConfigFromEnv, requirePrincipal, reply } from '@roomard/service-framework';
import { RoomardPool, dbConfigFromEnv } from '@roomard/db';
import { createLogger } from '@roomard/logger';
import { AuthService, authServiceConfigFromEnv } from './service.js';

const log = createLogger({ name: 'auth-svc' });

export function buildServer(deps: { pool: RoomardPool; auth: AuthService }): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });
  app.register(sensible);
  applyFramework(app, {
    serviceName: 'auth',
    authConfig: authConfigFromEnv(),
    publicPaths: [
      '/auth/sso/start',
      '/auth/sso/callback',
      '/auth/password/login',
      '/auth/mfa/verify',
      '/auth/refresh',
    ],
  });

  app.post('/auth/password/login', async (req, replyHttp) => {
    const body = PasswordLoginRequestSchema.parse(req.body);
    const result = await deps.auth.passwordLogin(body);
    if (result.status === 'mfa_required') {
      const resp: LoginResponse = { status: 'mfa_required', mfaToken: result.mfaToken };
      reply(replyHttp, 200, resp);
      return;
    }
    const resp: LoginResponse = {
      status: 'success',
      tokens: { ...result.tokens, tokenType: 'Bearer' },
      user: {
        id: result.session.userId,
        email: result.session.email,
        displayName: result.session.displayName,
        tenantId: result.session.tenantId,
        roles: result.session.roles,
      },
    };
    reply(replyHttp, 200, resp);
  });

  app.post('/auth/mfa/verify', async (req, replyHttp) => {
    const body = MfaVerifyRequestSchema.parse(req.body);
    const result = await deps.auth.verifyMfa(body);
    const resp: LoginResponse = {
      status: 'success',
      tokens: { ...result.tokens, tokenType: 'Bearer' },
      user: {
        id: result.session.userId,
        email: result.session.email,
        displayName: result.session.displayName,
        tenantId: result.session.tenantId,
        roles: result.session.roles,
      },
    };
    reply(replyHttp, 200, resp);
  });

  app.post('/auth/refresh', async (req, replyHttp) => {
    const body = RefreshRequestSchema.parse(req.body);
    const result = await deps.auth.refresh(body.refreshToken);
    const resp: LoginResponse = {
      status: 'success',
      tokens: { ...result.tokens, tokenType: 'Bearer' },
      user: {
        id: result.session.userId,
        email: result.session.email,
        displayName: result.session.displayName,
        tenantId: result.session.tenantId,
        roles: result.session.roles,
      },
    };
    reply(replyHttp, 200, resp);
  });

  app.post('/auth/logout', async (req, replyHttp) => {
    const body = LogoutRequestSchema.parse(req.body ?? {});
    const principal = requirePrincipal(req);
    await deps.auth.logout(body.refreshToken, body.allDevices ?? false, principal.userId);
    replyHttp.code(204).send();
  });

  app.get('/auth/me', async (req, replyHttp) => {
    const principal = requirePrincipal(req);
    const me = await deps.auth.me(principal.userId);
    const resp: MeResponse = {
      id: me.userId,
      email: me.email,
      displayName: me.displayName,
      tenantId: me.tenantId,
      tenantSlug: me.tenantSlug,
      roles: me.roles.map((name) => ({ id: '00000000-0000-0000-0000-000000000000', name, permissions: [] })),
      properties: [],
      mfaEnrolled: me.mfaEnrolled,
    };
    reply(replyHttp, 200, resp);
  });

  // SSO stubs — real implementation slotted in Sprint 2 when IdP creds are available.
  app.post('/auth/sso/start', async (_req, replyHttp) => {
    replyHttp.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'SSO not yet wired in this build' },
    });
  });

  app.get('/auth/sso/callback', async (_req, replyHttp) => {
    replyHttp.code(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'SSO not yet wired in this build' },
    });
  });

  return app;
}

export async function start(): Promise<void> {
  const pool = new RoomardPool(dbConfigFromEnv());
  const auth = new AuthService(pool, authServiceConfigFromEnv());
  const app = buildServer({ pool, auth });
  const port = Number.parseInt(process.env.AUTH_PORT ?? '3001', 10);
  await app.listen({ port, host: '0.0.0.0' });
  log.info({ port }, 'auth-svc listening');

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await app.close();
    await pool.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  start().catch((err) => {
    log.error({ err }, 'failed to start');
    process.exit(1);
  });
}
