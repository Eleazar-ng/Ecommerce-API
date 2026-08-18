import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

const objectIdSchema = z.string().refine(isValidObjectId, { message: 'Invalid id' });

export const adminListTransactionsSchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'succeeded', 'failed']).optional(),
    type: z.enum(['payment', 'refund']).optional(),
    userId: objectIdSchema.optional(),
    orderId: objectIdSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export type AdminListTransactionsQuery = z.infer<typeof adminListTransactionsSchema>['query'];

export const getTransactionSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});