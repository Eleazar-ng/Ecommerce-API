import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import z from 'zod';
import { ValidationError, type FieldErrorDetail } from '../utils/appError.js';

// Schemas are shaped like z.object({ body: ..., params: ..., query: ... }) so a single
// validate() call can check all three parts of a request at once.
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result:any = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      // Zod's .issues gives one entry per failed field, with a `path` array like
      // ['body', 'email']. Drop the 'body'/'params'/'query' prefix — the client only cares
      // about the field name itself, not which part of the request it came from.
      const details: FieldErrorDetail[] = result.error.issues.map((issue:any) => ({
        field: issue.path.slice(1).join('.') || issue.path.join('.'),
        message: issue.message,
      }));
      return next(new ValidationError(details));
    }

    // Overwrite with parsed data (not just validated) so defaults Zod applied actually
    // reach the controller.
    if (result.data.body) req.body = result.data.body;
    if (result.data.params) req.params = result.data.params;
    if (result.data.query) req.query = result.data.query;

    next();
  };
}