import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AppError, ErrorCode, type FieldErrorDetail } from '../utils/appError.js';

interface ErrorResponseBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: FieldErrorDetail[];
    stack?: string;
  };
}

// Extracts the offending field name from a Mongo duplicate-key error. err.keyValue looks
// like { email: "a@b.com" } — we only need the key.
function fieldFromDuplicateKeyError(err: mongoose.mongo.MongoServerError): string {
  return Object.keys(err.keyValue ?? {})[0] ?? 'field';
}

function normalize(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  // Invalid ObjectId in a route param (e.g. GET /products/not-a-real-id) — Mongoose throws
  // CastError before your controller code ever runs.
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid ${err.path}: ${err.value}`, 400, ErrorCode.BAD_REQUEST);
  }

  // A Mongoose schema validator rejected the document (e.g. min/max, enum, custom validate).
  // Reachable even though Zod validates requests first — Zod checks the REQUEST shape,
  // this catches anything that still violates the SCHEMA at save() time (e.g. a service
  // constructing a document programmatically, not from user input).
  if (err instanceof mongoose.Error.ValidationError) {
    const details: FieldErrorDetail[] = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return new AppError('Validation failed', 422, ErrorCode.VALIDATION_ERROR, details);
  }

  // MongoServerError code 11000 = duplicate key on a unique index. Every unique index in
  // this app (User.email, User.username, User.googleId, Category.slug, Product.slug,
  // Transaction.stripeEventId, Cart.userId) surfaces here if something slips past an
  // application-level pre-check.
  if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
    const field = fieldFromDuplicateKeyError(err);
    return new AppError(`${field} already exists`, 409, ErrorCode.CONFLICT);
  }

  // Genuinely unexpected — a real bug, a network failure, anything not deliberately thrown.
  // Message is intentionally generic; the real error is logged, never sent to the client.
  return new AppError('Something went wrong', 500, ErrorCode.INTERNAL_ERROR);
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const normalized = normalize(err);

  // Log every error that reaches here with full detail server-side, regardless of what the
  // client sees. Operational errors (400s from bad input) are noise-level; genuine 500s are
  // the ones worth paying attention to in production logs.
  if (normalized.statusCode >= 500) {
    console.error(err);
  }

  const body: ErrorResponseBody = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
      // Stack traces are a real information leak (file paths, dependency versions,
      // sometimes fragments of source) — only ever attached outside production.
      ...(env.NODE_ENV !== 'production' && normalized.stack ? { stack: normalized.stack } : {}),
    },
  };

  res.status(normalized.statusCode).json(body);
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}