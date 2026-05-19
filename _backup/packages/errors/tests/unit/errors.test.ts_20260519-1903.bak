import { describe, it, expect } from 'vitest';

import {
  RoomardError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  IntegrationError,
  ServiceUnavailableError,
  MfaRequiredError,
  isRoomardError,
  toSerializedError,
  categoryToStatus,
} from '../../src/index.js';

describe('RoomardError hierarchy', () => {
  it('ValidationError carries 400 status and array-or-object details', () => {
    const e1 = new ValidationError('bad input', [{ field: 'email', reason: 'invalid' }]);
    expect(e1.status).toBe(400);
    expect(e1.code).toBe('validation_failed');
    expect(e1.category).toBe('validation');
    expect(e1.details).toHaveLength(1);

    const e2 = new ValidationError('bad input', { hint: 'email is required' });
    expect(e2.details[0]).toEqual({ hint: 'email is required' });
  });

  it('AuthenticationError defaults', () => {
    const e = new AuthenticationError();
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthenticated');
    expect(e.category).toBe('authentication');
  });

  it('AuthorizationError defaults', () => {
    const e = new AuthorizationError();
    expect(e.status).toBe(403);
    expect(e.category).toBe('authorization');
  });

  it('NotFoundError accepts single-arg form (message only)', () => {
    const e = new NotFoundError('guest not found');
    expect(e.status).toBe(404);
    expect(e.message).toBe('guest not found');
    expect(e.code).toBe('not_found');
  });

  it('NotFoundError accepts object details', () => {
    const e = new NotFoundError('guest not found', { guestId: 'g1' });
    expect(e.details[0]).toMatchObject({ guestId: 'g1' });
  });

  it('ConflictError supports both (message, details) and (code, message, details)', () => {
    const e1 = new ConflictError('already exists', { existing: 'r1' });
    expect(e1.status).toBe(409);
    expect(e1.code).toBe('conflict');
    const e2 = new ConflictError('duplicate_email', 'already exists', { existing: 'r1' });
    expect(e2.code).toBe('duplicate_email');
  });

  it('RateLimitError supports message+seconds and seconds-only forms', () => {
    const e1 = new RateLimitError(60);
    expect(e1.status).toBe(429);
    expect(e1.retryAfterSeconds).toBe(60);
    const e2 = new RateLimitError('over the limit', 120);
    expect(e2.message).toBe('over the limit');
    expect(e2.retryAfterSeconds).toBe(120);
  });

  it('DatabaseError → 500', () => {
    expect(new DatabaseError('boom').status).toBe(500);
  });

  it('IntegrationError accepts (message) and (code, message) forms', () => {
    const e1 = new IntegrationError('mews unreachable');
    expect(e1.status).toBe(502);
    expect(e1.code).toBe('integration_error');
    const e2 = new IntegrationError('mews_timeout', 'mews timed out');
    expect(e2.code).toBe('mews_timeout');
  });

  it('ServiceUnavailableError → 503', () => {
    expect(new ServiceUnavailableError().status).toBe(503);
  });

  it('MfaRequiredError → 403 with mfa_required code', () => {
    const e = new MfaRequiredError();
    expect(e.code).toBe('mfa_required');
    expect(e.status).toBe(403);
  });

  it('isRoomardError type guard', () => {
    expect(isRoomardError(new ValidationError('x'))).toBe(true);
    expect(isRoomardError(new Error('vanilla'))).toBe(false);
    expect(isRoomardError(null)).toBe(false);
    expect(isRoomardError({})).toBe(false);
  });

  it('toSerializedError attaches request_id when supplied', () => {
    const e = new NotFoundError('guest not found', { guestId: 'g1' });
    const out = toSerializedError(e, 'req-123');
    expect(out.code).toBe('not_found');
    expect(out.message).toBe('guest not found');
    expect(out.request_id).toBe('req-123');
    expect(out.details?.[0]).toMatchObject({ guestId: 'g1' });
  });

  it('toSerializedError handles non-RoomardError as 500', () => {
    const out = toSerializedError(new Error('boom'), 'req-9');
    expect(out.status).toBe(500);
    expect(out.code).toBe('internal_error');
  });

  it('categoryToStatus mapping', () => {
    expect(categoryToStatus('validation')).toBe(400);
    expect(categoryToStatus('not_found')).toBe(404);
    expect(categoryToStatus('rate_limited')).toBe(429);
    expect(categoryToStatus('unavailable')).toBe(503);
    expect(categoryToStatus('internal')).toBe(500);
  });

  it('RoomardError.toJSON omits empty details', () => {
    const e = new AuthenticationError();
    const json = e.toJSON();
    expect(json.details).toBeUndefined();
  });
});
