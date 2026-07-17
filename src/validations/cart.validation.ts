import { z } from 'zod';
import { isValidObjectId } from 'mongoose';

// Validating the ObjectId SHAPE here (not just letting a bad id hit Mongoose and throw a
// CastError) means a malformed productId gets a clean 422 with a specific field name,
// instead of a 400 with Mongoose's generic "Invalid _id: xyz" message.
const objectIdSchema = z.string().refine(isValidObjectId, { message: 'Invalid product id' });

const quantitySchema = z
  .number()
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1');
// NOTE: 0 is deliberately not a valid quantity here — removing an item goes through
// DELETE /cart/items/:productId, not PATCH .../items/:id with quantity: 0. Keeps "remove"
// as one explicit action instead of two ways to do the same thing.

export const addItemSchema = z.object({
  body: z.object({
    productId: objectIdSchema,
    quantity: quantitySchema.default(1),
  }),
});

export const updateItemSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
  body: z.object({
    quantity: quantitySchema,
  }),
});

export const removeItemSchema = z.object({
  params: z.object({
    productId: objectIdSchema,
  }),
});