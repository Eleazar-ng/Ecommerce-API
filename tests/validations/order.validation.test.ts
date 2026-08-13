import { describe, it, expect } from 'vitest';
import { updateOrderStatusSchema } from '../../src/validations/order.validation.js';

const validId = '507f1f77bcf86cd799439011';

describe('updateOrderStatusSchema — restricted transition set', () => {
  it('accepts "shipped"', () => {
    const result = updateOrderStatusSchema.safeParse({ params: { id: validId }, body: { status: 'shipped' } });
    expect(result.success).toBe(true);
  });

  it('accepts "delivered"', () => {
    const result = updateOrderStatusSchema.safeParse({ params: { id: validId }, body: { status: 'delivered' } });
    expect(result.success).toBe(true);
  });

  // These are the security-relevant cases, not just validation nicety: an admin must NEVER
  // be able to manually set a status that's exclusively owned by the Stripe webhook
  // ('paid'/'failed') or the refund flow ('refunded'). If this schema ever regressed to
  // accept these, admin-order.service.ts's ALLOWED_TRANSITIONS check would be the only
  // remaining defense — this test is what catches the regression at the validation layer,
  // before it even reaches that service logic.
  it.each(['paid', 'failed', 'pending', 'cancelled', 'refunded'])(
    'rejects "%s" — only the webhook/refund flow may ever set this status',
    (status) => {
      const result = updateOrderStatusSchema.safeParse({ params: { id: validId }, body: { status } });
      expect(result.success).toBe(false);
    }
  );

  it('rejects a malformed order id', () => {
    const result = updateOrderStatusSchema.safeParse({
      params: { id: 'not-a-real-id' },
      body: { status: 'shipped' },
    });
    expect(result.success).toBe(false);
  });
});