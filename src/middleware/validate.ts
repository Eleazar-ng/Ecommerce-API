import type { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';
import z from 'zod';
import { AppError } from '../utils/appError.js';

// Schemas are shaped like z.object({ body: ..., params: ..., query: ... }) so a single
// validate() call can check all three parts of a request at once.
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result: any = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const details = z.treeifyError(result.error);
      return next(new AppError(`Validation failed: ${JSON.stringify(details)}`, 422));
    }

    // Overwrite with parsed data (not just validated) so defaults Zod applied actually
    // reach the controller.
    if (result.data.body) req.body = result.data.body;
    if (result.data.params) req.params = result.data.params;
    if (result.data.query) req.query = result.data.query;

    next();
  };
}