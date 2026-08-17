import { describe, it, expect } from 'vitest';
import { addItemSchema, updateItemSchema } from '../../src/validations/cart.validation.js';

const validProductId = '507f1f77bcf86cd799439011'; // valid-shaped ObjectId

describe('addItemSchema', () => {
  it('defaults quantity to 1 when omitted', () => {
    const result = addItemSchema.safeParse({ body: { productId: validProductId } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.quantity).toBe(1);
    }
  });

  it('rejects a quantity of 0 — removal is a separate, explicit DELETE action, not PATCH quantity:0', () => {
    const result = addItemSchema.safeParse({ body: { productId: validProductId, quantity: 0 } });
    expect(result.success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    const result = addItemSchema.safeParse({ body: { productId: validProductId, quantity: -1 } });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer quantity', () => {
    const result = addItemSchema.safeParse({ body: { productId: validProductId, quantity: 1.5 } });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed productId', () => {
    const result = addItemSchema.safeParse({ body: { productId: 'not-a-real-id', quantity: 1 } });
    expect(result.success).toBe(false);
  });
});

describe('updateItemSchema', () => {
  it('requires an explicit quantity (no default) — this is an update, not an add', () => {
    const result = updateItemSchema.safeParse({
      params: { productId: validProductId },
      body: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid explicit quantity update', () => {
    const result = updateItemSchema.safeParse({
      params: { productId: validProductId },
      body: { quantity: 3 },
    });
    expect(result.success).toBe(true);
  });
});