import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

const objectIdSchema = z.string().refine(isValidObjectId, { message: 'Invalid id' });

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(5000).optional().default(''),
    priceCents: z.number().int().min(0),
    stock: z.number().int().min(0).default(0),
    categoryId: objectIdSchema,
    images: z.array(z.url()).default([]),
    tags: z.array(z.string()).default([]),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      priceCents: z.number().int().min(0).optional(),
      categoryId: objectIdSchema.optional(),
      images: z.array(z.string().url()).optional(),
      tags: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
      // NOTE: `stock` is deliberately NOT accepted here. Inventory changes go through
      // PATCH /products/:id/stock (updateStockSchema below) instead — kept as a separate,
      // separately-permissioned action from general product editing. See
      // docs/deferred-decisions.md / Stage 7 scope discussion for the reasoning.
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' }),
});

export const updateStockSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z.object({
    stock: z.number().int().min(0, 'Stock cannot be negative'),
  }),
});

export const getProductSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

export const listProductsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    category: objectIdSchema.optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    tags: z.string().optional(), // comma-separated, split in the service layer
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // z.coerce.boolean() is a known Zod footgun here — it coerces ANY non-empty string
    // (including the literal string "false") to `true`, since it's really just JS's
    // Boolean() under the hood. Explicit string-literal matching avoids that trap.
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  }),
});

export type ListProductsQuery = z.infer<typeof listProductsSchema>['query'];