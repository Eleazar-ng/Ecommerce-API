import { describe, it, expect } from 'vitest';
import {
  updateProductSchema,
  listProductsSchema,
  createProductSchema,
} from '../../src/validations/product.validation.js';

const validId = '507f1f77bcf86cd799439011';

describe('listProductsSchema — includeInactive boolean parsing', () => {
  // This is the specific footgun the schema was deliberately built to avoid:
  // z.coerce.boolean() would treat ANY non-empty string (including the literal string
  // "false") as true, since it's really just JS's Boolean(str) under the hood. Explicit
  // string-literal enum matching sidesteps that entirely — this test is what actually
  // guards against a regression back to the naive z.coerce.boolean() approach.
  it('correctly parses the string "false" as boolean false', () => {
    const result = listProductsSchema.safeParse({ query: { includeInactive: 'false' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.includeInactive).toBe(false);
    }
  });

  it('correctly parses the string "true" as boolean true', () => {
    const result = listProductsSchema.safeParse({ query: { includeInactive: 'true' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.includeInactive).toBe(true);
    }
  });

  it('rejects any value other than the literal strings "true"/"false"', () => {
    const result = listProductsSchema.safeParse({ query: { includeInactive: 'yes' } });
    expect(result.success).toBe(false);
  });

  it('defaults page to 1 and limit to 20 when omitted', () => {
    const result = listProductsSchema.safeParse({ query: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query.page).toBe(1);
      expect(result.data.query.limit).toBe(20);
    }
  });

  it('rejects a limit above 100', () => {
    const result = listProductsSchema.safeParse({ query: { limit: '101' } });
    expect(result.success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('rejects an empty update body — the .refine() guard against a no-op request', () => {
    const result = updateProductSchema.safeParse({ params: { id: validId }, body: {} });
    expect(result.success).toBe(false);
  });

  it('accepts an update with just one field changed', () => {
    const result = updateProductSchema.safeParse({ params: { id: validId }, body: { priceCents: 999 } });
    expect(result.success).toBe(true);
  });

  it('silently strips a stock field if present — stock changes only go through the dedicated PATCH /:id/stock endpoint', () => {
    const result = updateProductSchema.safeParse({
      params: { id: validId },
      body: { priceCents: 999, stock: 50 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).not.toHaveProperty('stock');
    }
  });
});

describe('createProductSchema', () => {
  it('rejects negative priceCents', () => {
    const result = createProductSchema.safeParse({
      body: { name: 'Test', priceCents: -100, categoryId: validId },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer priceCents — no fractional cents', () => {
    const result = createProductSchema.safeParse({
      body: { name: 'Test', priceCents: 999.5, categoryId: validId },
    });
    expect(result.success).toBe(false);
  });

  it('defaults stock to 0 and images/tags to empty arrays when omitted', () => {
    const result = createProductSchema.safeParse({
      body: { name: 'Test', priceCents: 999, categoryId: validId },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.stock).toBe(0);
      expect(result.data.body.images).toEqual([]);
      expect(result.data.body.tags).toEqual([]);
    }
  });

  it('rejects an image entry missing a publicId (Stage 9 shape: { url, publicId })', () => {
    const result = createProductSchema.safeParse({
      body: {
        name: 'Test',
        priceCents: 999,
        categoryId: validId,
        images: [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg' }],
      },
    });
    expect(result.success).toBe(false);
  });
});