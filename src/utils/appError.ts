

// One error code per category, used by the client to branch on error TYPE without parsing
// the message string (messages can change wording; codes shouldn't).
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface FieldErrorDetail {
  field: string;
  message: string;
}

// Base class. `isOperational` distinguishes errors we deliberately threw (safe to show the
// client a specific message) from bugs/unexpected exceptions (never expose the raw message —
// see errorHandler.ts). Every subclass below sets isOperational: true implicitly by going
// through this constructor with a real message.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: FieldErrorDetail[];

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: FieldErrorDetail[] | any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 422 — request shape/content failed validation (Zod) or a Mongoose schema validator.
// `details` carries field-level errors so the client can highlight specific form fields
// instead of just showing one blob of text.
export class ValidationError extends AppError {
  constructor(details: FieldErrorDetail[], message = 'Validation failed') {
    super(message, 422, ErrorCode.VALIDATION_ERROR, details);
  }
}

// 401 — no valid identity established (missing/invalid/expired token, bad credentials).
export class UnauthorizedError extends AppError {
  constructor(message = 'Not authenticated') {
    super(message, 401, ErrorCode.UNAUTHORIZED);
  }
}

// 403 — identity IS established, but this identity isn't allowed to do this
// (wrong role, missing permission, suspended account).
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403, ErrorCode.FORBIDDEN);
  }
}

// 404 — the resource itself doesn't exist (or, for security, the caller isn't allowed to
// know whether it exists — some code paths deliberately use this instead of 403).
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, ErrorCode.NOT_FOUND);
  }
}

// 409 — the request is individually valid but conflicts with existing state
// (duplicate email/username, double-processing a webhook, etc.).
export class ConflictError extends AppError {
  constructor(message = 'Conflict with existing data') {
    super(message, 409, ErrorCode.CONFLICT);
  }
}

// 400 — malformed request that isn't really a "validation" failure in the Zod sense
// (e.g. an invalid MongoDB ObjectId in a URL param — CastError territory).
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400, ErrorCode.BAD_REQUEST);
  }
}