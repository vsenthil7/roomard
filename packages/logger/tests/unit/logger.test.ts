import { describe, it, expect } from 'vitest';

import { createLogger, parseSentryDsn } from '../../src/index.js';

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
