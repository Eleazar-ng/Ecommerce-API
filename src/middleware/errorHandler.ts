import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError.js';

// Bare-bones for now, deliberately. Stage 4 decides the real response envelope shape,
// how Zod validation errors and Mongoose errors get normalized into it, and what gets
// exposed vs. hidden in production.
export function errorHandler(err: Error | AppError, req: Request, res: Response, next: NextFunction): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError && err.isOperational ? err.message : 'Something went wrong';

  if (!isAppError || !err.isOperational) {
    console.error(err); // unexpected errors get logged in full; operational ones don't need to
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}