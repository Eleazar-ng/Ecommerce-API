import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

const objectIdSchema = z.string().refine(isValidObjectId, { message: 'Invalid id' });

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({
      name: z.string().min(1).max(100).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' }),
});

export const categoryIdSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});