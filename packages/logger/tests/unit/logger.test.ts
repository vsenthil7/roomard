import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createLogger, parseSentryDsn } from '../../src/index.js';

// undici is mocked so the Sentry forwarder makes no real network call. The mock
// fn is created via vi.hoisted so it exists before vi.mock's hoisted factory runs.
const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(async () => ({ statusCode: 200, body: { json: async () => ({}) } })),
}));
vi.mock('undici', () => ({
  request: requestMock,
}));

describe('createLogger', () => {
  it('returns a pino logger with the given name and standard methods', () => {
    const log = createLogger({ name: 'test-svc' });
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.child).toBe('function');
  });

  it('creates a child logger that inherits bindings', () => {
    const log = createLogger({ name: 'parent' });
    const child = log.child({ component: 'sub' });
    expect(typeof child.info).toBe('function');
    const bindings = child.bindings();
    expect(bindings.component).toBe('sub');
    expect(bindings.service).toBe('parent');
  });

  it('honours a custom log level', () => {
    const log = createLogger({ name: 'test-svc', level: 'debug' });
    expect(log.level).toBe('debug');
  });

  it('captures base context', () => {
    const log = createLogger({ name: 'test-svc', base: { region: 'eu-west-1' } });
    const bindings = log.bindings();
    expect(bindings.service).toBe('test-svc');
    expect(bindings.region).toBe('eu-west-1');
  });

  it('does not crash when error/fatal called without SENTRY_DSN', () => {
    // The Sentry hook is registered unconditionally; it must no-op silently
    // when DSN is unset. If this throws, every error log in dev/test would crash.
    delete process.env.SENTRY_DSN;
    const log = createLogger({ name: 'test-svc' });
    expect(() => log.error('boom')).not.toThrow();
    expect(() => log.error({ err: new Error('boom') }, 'failed')).not.toThrow();
  });
});

describe('parseSentryDsn', () => {
  it('parses a standard Sentry DSN', () => {
    const parsed = parseSentryDsn('https://abc123@o12345.ingest.sentry.io/67890');
    expect(parsed).not.toBeNull();
    expect(parsed?.publicKey).toBe('abc123');
    expect(parsed?.projectId).toBe('67890');
    expect(parsed?.url).toBe('https://o12345.ingest.sentry.io/api/67890/envelope/');
  });

  it('returns null for undefined DSN', () => {
    expect(parseSentryDsn(undefined)).toBeNull();
  });

  it('returns null for empty DSN', () => {
    expect(parseSentryDsn('')).toBeNull();
  });

  it('returns null for malformed DSN (no key)', () => {
    expect(parseSentryDsn('https://sentry.io/12345')).toBeNull();
  });

  it('returns null for malformed DSN (no project ID)', () => {
    expect(parseSentryDsn('https://abc123@sentry.io/')).toBeNull();
  });

  it('returns null for non-URL string', () => {
    expect(parseSentryDsn('not-a-url')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sentry forwarder — exercised through the public createLogger() hook with
// undici mocked, so no real network call is made. Covers the forwardToSentry,
// parseStack and randomHex internals (CP-57).
// ---------------------------------------------------------------------------

/** Wait for the fire-and-forget forwardToSentry microtask to settle. */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('Sentry forwarder (forwardToSentry via the logMethod hook)', () => {
  const DSN = 'https://pub123@o999.ingest.sentry.io/4242';

  beforeEach(() => {
    requestMock.mockClear();
    process.env.SENTRY_DSN = DSN;
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_RELEASE;
  });

  it('forwards an error log to the Sentry envelope endpoint', async () => {
    const log = createLogger({ name: 'fwd-svc' });
    log.error('something broke');
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(1);
    const [url, opts] = requestMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://o999.ingest.sentry.io/api/4242/envelope/');
    expect(opts.headers['content-type']).toBe('application/x-sentry-envelope');
    expect(opts.headers['x-sentry-auth']).toContain('sentry_key=pub123');
  });

  it('does NOT forward info/warn logs (only error/fatal)', async () => {
    const log = createLogger({ name: 'fwd-svc' });
    log.info('all good');
    log.warn('careful');
    await flush();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('forwards fatal logs too', async () => {
    const log = createLogger({ name: 'fwd-svc' });
    log.fatal('process dying');
    await flush();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('builds an exception payload with a stacktrace from an Error object', async () => {
    const log = createLogger({ name: 'fwd-svc' });
    log.error({ err: new Error('kaboom') }, 'handler failed');
    await flush();
    const [, opts] = requestMock.mock.calls[0] as [string, { body: string }];
    // The envelope body is 3 newline-separated JSON lines; the 3rd is the event.
    const event = JSON.parse(opts.body.split('\n')[2]) as {
      level?: string;
      server_name?: string;
      exception?: { values: Array<{ type: string; value: string; stacktrace?: unknown }> };
    };
    expect(event.level).toBe('error');
    expect(event.server_name).toBe('fwd-svc');
    expect(event.exception?.values[0]?.type).toBe('Error');
    expect(event.exception?.values[0]?.value).toBe('kaboom');
    expect(event.exception?.values[0]?.stacktrace).toBeDefined();
  });

  it('handles a bare Error argument (not wrapped in an object)', async () => {
    const log = createLogger({ name: 'fwd-svc' });
    log.error(new Error('bare'));
    await flush();
    const [, opts] = requestMock.mock.calls[0] as [string, { body: string }];
    const event = JSON.parse(opts.body.split('\n')[2]) as {
      exception?: { values: Array<{ value: string }> };
    };
    expect(event.exception?.values[0]?.value).toBe('bare');
  });

  it('reads an { error } key as well as { err }', async () => {
    const log = createLogger({ name: 'fwd-svc' });
    log.error({ error: new Error('via-error-key') }, 'oops');
    await flush();
    const [, opts] = requestMock.mock.calls[0] as [string, { body: string }];
    const event = JSON.parse(opts.body.split('\n')[2]) as {
      exception?: { values: Array<{ value: string }> };
    };
    expect(event.exception?.values[0]?.value).toBe('via-error-key');
  });

  it('includes release + environment when set', async () => {
    process.env.SENTRY_RELEASE = 'roomard@1.2.3';
    process.env.NODE_ENV = 'production';
    const log = createLogger({ name: 'fwd-svc' });
    log.error('with release');
    await flush();
    const [, opts] = requestMock.mock.calls[0] as [string, { body: string }];
    const event = JSON.parse(opts.body.split('\n')[2]) as { release?: string };
    expect(event.release).toBe('roomard@1.2.3');
  });

  it('does not throw when the Sentry HTTP call rejects (forwarder failures are swallowed)', async () => {
    requestMock.mockRejectedValueOnce(new Error('network down'));
    const log = createLogger({ name: 'fwd-svc' });
    expect(() => log.error('still safe')).not.toThrow();
    await flush();
    // The rejection happened inside the swallowed .catch — no unhandled rejection.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('skips forwarding when DSN is malformed even though the hook fires', async () => {
    process.env.SENTRY_DSN = 'not-a-valid-dsn';
    const log = createLogger({ name: 'fwd-svc' });
    log.error('malformed dsn');
    await flush();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
