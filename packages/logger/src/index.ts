/**
 * @roomard/logger — Structured JSON logger.
 *
 * Wraps pino. Every log line carries the service name (set via createLogger), and any
 * tenant_id, user_id, request_id, correlation_id keys passed via context are preserved
 * across child loggers.
 *
 * Sensitive fields are redacted by default: password, password_hash, token, secret,
 * authorization, cookie, mfa_secret, credentials_ref.
 *
 * Observability: when SENTRY_DSN is set, error/fatal log lines are forwarded to
 * Sentry via a lightweight HTTP transport that does not require the full
 * @sentry/node dependency. This keeps the bundle small for services that
 * don't need Sentry's auto-instrumentation. See `forwardToSentry` below.
 */
import { pino, stdSerializers, stdTimeFunctions, type Logger as PinoLogger, type LoggerOptions } from 'pino';
import { request as undiciRequest } from 'undici';

export interface CreateLoggerOptions {
  name: string;
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  base?: Record<string, unknown>;
}

const SENSITIVE_PATHS = [
  'password',
  'password_hash',
  '*.password',
  '*.password_hash',
  'token',
  'tokens',
  'access_token',
  'refresh_token',
  '*.access_token',
  '*.refresh_token',
  'authorization',
  'cookie',
  '*.cookie',
  'set-cookie',
  'mfa_secret',
  'credentials_ref',
  'secret',
  '*.secret',
];

export type Logger = PinoLogger;

export function createLogger(opts: CreateLoggerOptions): Logger {
  const level = opts.level ?? (process.env.LOG_LEVEL as LoggerOptions['level']) ?? 'info';
  const base = pino({
    name: opts.name,
    level,
    base: { service: opts.name, env: process.env.NODE_ENV, ...(opts.base ?? {}) },
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: SENSITIVE_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    serializers: {
      err: stdSerializers.err,
      error: stdSerializers.err,
    },
    hooks: {
      logMethod(this: PinoLogger, args: unknown[], method) {
        // Tap into error/fatal calls and forward to Sentry asynchronously.
        // Forwarding failures must never crash the calling code, so we
        // catch + drop any errors from the forwarder.
        const lvl = method.name as string | undefined;
        if (lvl === 'error' || lvl === 'fatal') {
          void forwardToSentry({
            level: lvl,
            service: opts.name,
            payload: args,
            release: process.env.SENTRY_RELEASE,
            environment: process.env.NODE_ENV,
          }).catch(() => {
            // Swallow — we don't want logging to fail because monitoring did.
          });
        }
        method.apply(this, args as Parameters<typeof method>);
      },
    },
  });
  return base;
}

// ---------------------------------------------------------------------------
// Sentry forwarder (HTTP minimal-payload, no SDK dependency)
// ---------------------------------------------------------------------------

interface ForwardArgs {
  level: 'error' | 'fatal';
  service: string;
  payload: unknown[];
  release?: string;
  environment?: string;
}

/**
 * Parse a Sentry DSN into the envelope endpoint and credentials it implies.
 * Example DSN:
 *   https://<publicKey>@<host>/<projectId>
 * Returns null if the DSN is missing or malformed.
 *
 * Exported for tests; not part of the package's public API contract.
 */
export function parseSentryDsn(dsn: string | undefined): {
  url: string;
  publicKey: string;
  projectId: string;
} | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!publicKey || !projectId) return null;
    const url = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
    return { url, publicKey, projectId };
  } catch {
    return null;
  }
}

async function forwardToSentry(args: ForwardArgs): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return; // Sentry not configured — silently skip.

  // Sentry's "envelope" format. We send minimal events that work for both
  // log lines and Error objects. The first item is the envelope header,
  // followed by item headers and item payloads, separated by newlines.
  const eventId = randomHex(32);
  const timestamp = new Date().toISOString();

  // Extract a usable message + error from the payload args.
  // pino's logMethod gets called as either (obj, msg) or (msg) or (obj).
  let message = 'log event';
  let extra: Record<string, unknown> = {};
  let errorInfo: { type: string; value: string; stack?: string } | undefined;
  for (const a of args.payload) {
    if (typeof a === 'string') {
      message = a;
    } else if (a instanceof Error) {
      errorInfo = { type: a.name, value: a.message, stack: a.stack };
    } else if (typeof a === 'object' && a !== null) {
      const o = a as Record<string, unknown>;
      // Pino convention: err / error key on the object.
      if (o.err instanceof Error) {
        const e = o.err;
        errorInfo = { type: e.name, value: e.message, stack: e.stack };
      } else if (o.error instanceof Error) {
        const e = o.error;
        errorInfo = { type: e.name, value: e.message, stack: e.stack };
      }
      extra = { ...extra, ...o };
    }
  }

  const event: Record<string, unknown> = {
    event_id: eventId,
    timestamp,
    level: args.level,
    platform: 'node',
    server_name: args.service,
    environment: args.environment,
    release: args.release,
    message: { formatted: message },
    extra,
  };
  if (errorInfo) {
    event.exception = {
      values: [
        {
          type: errorInfo.type,
          value: errorInfo.value,
          stacktrace: errorInfo.stack ? { frames: parseStack(errorInfo.stack) } : undefined,
        },
      ],
    };
  }

  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    dsn,
    sent_at: timestamp,
  });
  const itemHeader = JSON.stringify({ type: 'event' });
  const itemPayload = JSON.stringify(event);
  const body = `${envelopeHeader}\n${itemHeader}\n${itemPayload}\n`;

  // Sentry-Auth header — required for the envelope endpoint.
  const auth =
    `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, ` +
    `sentry_client=roomard-logger/0.1.0`;

  await undiciRequest(parsed.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-sentry-envelope',
      'x-sentry-auth': auth,
    },
    body,
    headersTimeout: 5000,
    bodyTimeout: 5000,
  });
}

function parseStack(stack: string): Array<{ filename: string; function?: string; lineno?: number }> {
  // Very minimal stack parser; enough to give Sentry something to display.
  return stack
    .split('\n')
    .slice(1, 31) // top 30 frames is plenty for routing
    .map((line) => {
      const match = /at\s+(?:(.+?)\s+\()?(.+?)(?::(\d+))?(?::(\d+))?\)?$/.exec(line.trim());
      if (!match) return { filename: line.trim() };
      return {
        filename: match[2] ?? '',
        function: match[1] ?? undefined,
        lineno: match[3] ? Number.parseInt(match[3], 10) : undefined,
      };
    });
}

function randomHex(length: number): string {
  // crypto.randomUUID returns 32 hex chars (after stripping dashes) — perfect for event_id.
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, length);
}
