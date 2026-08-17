import { Types } from 'mongoose';
import { Order } from '../../src/models/index.js';
import type { OrderStatus } from '../../src/models/index.js';

let counter = 0;

// Bypasses checkout entirely — T5 cares about the STATUS TRANSITION RULES and refund
// eligibility checks, not re-testing how an order gets created (already covered in T4).
// Creating orders directly in whatever status a given test needs keeps these tests fast
// and focused.
export async function createOrder(
  userId: string,
  overrides: Partial<{ status: OrderStatus; totalCents: number; stripePaymentIntentId: string }> = {}
) {
  counter += 1;
  return Order.create({
    userId,
    items: [{ productId: new Types.ObjectId(), name: `Item ${counter}`, priceCents: 1000, quantity: 1 }],
    totalCents: overrides.totalCents ?? 1000,
    status: overrides.status ?? 'pending',
    stripePaymentIntentId: overrides.stripePaymentIntentId,
    shippingAddress: { line1: '123 Test St', city: 'Testville', postalCode: '00000', country: 'US' },
  });
}