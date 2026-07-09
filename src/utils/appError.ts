// Placeholder for now — full error taxonomy (which status codes, which error codes,
// response envelope shape) gets decided deliberately in Stage 4. This just unblocks
// the app so app.ts has something to catch and respond with.
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}