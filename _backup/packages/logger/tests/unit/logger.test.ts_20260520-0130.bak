import { describe, it, expect } from 'vitest';

import { createLogger } from '../../src/index.js';

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
});
