import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

export const getOrderSchema = z.object({
  params: z.object({
    id: z.string().refine(isValidObjectId, { message: 'Invalid order id' }),
  }),
});