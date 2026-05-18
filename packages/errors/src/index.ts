/**
 * @roomard/errors — Typed error classes used across services.
 *
 * Every error has a stable `code` string (matches the API error model in API Spec §5).
 * Frontends branch on codes, not messages. Messages are for humans; codes are for code.
 */

export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'internal'
  | 'database'
  | 'integration';

export interface ErrorDetail {
  field?: string;
  reason?: string;
  hint?: string;
  [key: string]: unknown;
}

export interface SerializedError {
  code: string;
  message: string;
  category: ErrorCategory;
  status: number;
  details?: ErrorDetail[];
  request_id?: string;
}

/**
 * Root error class. All other errors inherit from this. Carries a stable code,
 * a category (drives HTTP status), and optional details.
 */
export class RoomardError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly status: number;
  public readonly details: ErrorDetail[];

  constructor(
    code: string,
    message: string,
    options: {
      category?: ErrorCategory;
      status?: number;
      details?: ErrorDetail[];
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.category = options.category ?? 'internal';
    this.status = options.status ?? categoryToStatus(options.category ?? 'internal');
    this.details = options.details ?? [];
  }

  toJSON(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      status: this.status,
      ...(this.details.length > 0 ? { details: this.details } : {}),
    };
  }
}

export class ValidationError extends RoomardError {
  constructor(message: string, details?: ErrorDetail[] | Record<string, unknown>) {
    super('validation_failed', message, {
      category: 'validation',
      status: 400,
      details: normaliseDetails(details),
    });
  }
}

export class AuthenticationError extends RoomardError {
  constructor(code = 'unauthenticated', message = 'Authentication required') {
    super(code, message, { category: 'authentication', status: 401 });
  }
}

export class AuthorizationError extends RoomardError {
  constructor(code = 'forbidden', message = 'Operation not permitted') {
    super(code, message, { category: 'authorization', status: 403 });
  }
}

export class NotFoundError extends RoomardError {
  constructor(message: string, codeOrDetails: string | ErrorDetail[] | Record<string, unknown> = 'not_found') {
    if (typeof codeOrDetails === 'string') {
      super(codeOrDetails, message, { category: 'not_found', status: 404 });
    } else {
      super('not_found', message, {
        category: 'not_found',
        status: 404,
        details: normaliseDetails(codeOrDetails),
      });
    }
  }
}

export class ConflictError extends RoomardError {
  constructor(messageOrCode: string, messageOrDetails?: string | ErrorDetail[] | Record<string, unknown>, details?: ErrorDetail[] | Record<string, unknown>) {
    // Support both (code, message, details) and (message, details) signatures.
    if (typeof messageOrDetails === 'string') {
      super(messageOrCode, messageOrDetails, {
        category: 'conflict',
        status: 409,
        details: normaliseDetails(details),
      });
    } else {
      super('conflict', messageOrCode, {
        category: 'conflict',
        status: 409,
        details: normaliseDetails(messageOrDetails),
      });
    }
  }
}

export class RateLimitError extends RoomardError {
  public readonly retryAfterSeconds?: number;
  constructor(messageOrSeconds: string | number = 'Too many requests', retryAfterSeconds?: number) {
    const message = typeof messageOrSeconds === 'string' ? messageOrSeconds : 'Too many requests';
    const seconds = typeof messageOrSeconds === 'number' ? messageOrSeconds : retryAfterSeconds;
    super('rate_limited', message, { category: 'rate_limited', status: 429 });
    this.retryAfterSeconds = seconds;
  }
}

export class DatabaseError extends RoomardError {
  constructor(message: string, cause?: unknown) {
    super('database_error', message, { category: 'database', status: 500, cause });
  }
}

export class IntegrationError extends RoomardError {
  constructor(messageOrCode: string, messageOrCause?: string | unknown, cause?: unknown) {
    if (typeof messageOrCause === 'string') {
      super(messageOrCode, messageOrCause, { category: 'integration', status: 502, cause });
    } else {
      super('integration_error', messageOrCode, {
        category: 'integration',
        status: 502,
        cause: messageOrCause,
      });
    }
  }
}

export class ServiceUnavailableError extends RoomardError {
  constructor(message = 'Service temporarily unavailable') {
    super('service_unavailable', message, { category: 'unavailable', status: 503 });
  }
}

export class MfaRequiredError extends AuthorizationError {
  constructor() {
    super('mfa_required', 'A fresh MFA assertion is required for this operation');
  }
}

function categoryToStatusInternal(category: ErrorCategory): number {
  switch (category) {
    case 'validation':
      return 400;
    case 'authentication':
      return 401;
    case 'authorization':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    case 'rate_limited':
      return 429;
    case 'unavailable':
      return 503;
    case 'database':
    case 'integration':
    case 'internal':
    default:
      return 500;
  }
}

function categoryToStatus(category: ErrorCategory): number {
  return categoryToStatusInternal(category);
}

/**
 * Convert an HTTP-friendly category name or details object/array into a normalised array.
 */
function normaliseDetails(
  details: ErrorDetail[] | Record<string, unknown> | undefined,
): ErrorDetail[] | undefined {
  if (!details) return undefined;
  if (Array.isArray(details)) return details;
  // Wrap a plain object into a single ErrorDetail
  return [details as ErrorDetail];
}

export { categoryToStatusInternal as categoryToStatus };

/**
 * Convert any thrown value into a SerializedError shape suitable for the API error envelope.
 * Logs sensitive internals only when the error is not a RoomardError; otherwise the typed
 * fields are returned verbatim.
 */
export function toSerializedError(err: unknown, requestId?: string): SerializedError {
  if (err instanceof RoomardError) {
    return { ...err.toJSON(), ...(requestId ? { request_id: requestId } : {}) };
  }
  return {
    code: 'internal_error',
    message: 'Internal server error',
    category: 'internal',
    status: 500,
    ...(requestId ? { request_id: requestId } : {}),
  };
}

/** Type guard — useful in catch blocks. */
export function isRoomardError(err: unknown): err is RoomardError {
  return err instanceof RoomardError;
}
