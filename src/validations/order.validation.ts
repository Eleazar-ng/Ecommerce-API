import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

export const getOrderSchema = z.object({
  params: z.object({
    id: z.string().refine(isValidObjectId, { message: 'Invalid order id' }),
  }),
});

export const adminListOrdersSchema = z.object({
  query: z.object({
    status: z
      .enum(['pending', 'paid', 'failed', 'cancelled', 'refunded', 'shipped', 'delivered'])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});
 
export type AdminListOrdersQuery = z.infer<typeof adminListOrdersSchema>['query'];
 
// Deliberately only accepts 'shipped'/'delivered' — an admin can never manually set
// 'paid'/'failed' (owned by the Stripe webhook) or 'refunded' (owned by the refund flow's
// webhook handler). See admin-order.service.ts's ALLOWED_TRANSITIONS for the full rule.
export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: z.string().refine(isValidObjectId, { message: 'Invalid order id' }),
  }),
  body: z.object({
    status: z.enum(['shipped', 'delivered']),
  }),
});
 