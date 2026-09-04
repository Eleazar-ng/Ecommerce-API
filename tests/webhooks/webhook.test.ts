import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/config/stripe.js', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
      cancel: vi.fn(),
    },
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  },
}));

import app from '../../src/app.js';
import { stripe } from '../../src/config/stripe.js';
import { Order, Product, Cart, Transaction } from '../../src/models/index.js';
import { setupCheckoutScenario, validShippingAddress } from '../helpers/checkout.helpers.js';

const mockCreate = vi.mocked(stripe.paymentIntents.create);
const mockConstructEvent = vi.mocked(stripe.webhooks.constructEvent);

function fakeIntent(id = 'pi_test_1') {
  return { id, client_secret: `${id}_secret_abc`, status: 'requires_payment_method' } as any;
}

// Builds a real pending Order (via the real checkout flow) so the webhook handlers have
// something genuine to react to, then returns everything needed to fabricate a matching
// Stripe event for it.
async function setupPendingOrder(overrides: { stock?: number; priceCents?: number; quantity?: number } = {}) {
  const scenario = await setupCheckoutScenario(overrides);
  const intentId = `pi_${scenario.userId}`;
  mockCreate.mockResolvedValue(fakeIntent(intentId));

  const checkoutRes = await request(app)
    .post('/api/v1/checkout')
    .set('Authorization', `Bearer ${scenario.accessToken}`)
    .send({ shippingAddress: validShippingAddress });

  return { ...scenario, orderId: checkoutRes.body.data.orderId as string, intentId };
}

function paymentIntentSucceededEvent(orderId: string, userId: string, intentId: string, eventId: string, amount: number) {
  return {
    id: eventId,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: intentId,
        amount,
        currency: 'usd',
        metadata: { orderId, userId },
      },
    },
  } as any;
}

function paymentIntentFailedEvent(orderId: string, userId: string, intentId: string, eventId: string, amount: number) {
  return {
    id: eventId,
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: intentId,
        amount,
        currency: 'usd',
        metadata: { orderId, userId },
      },
    },
  } as any;
}

function chargeRefundedEvent(intentId: string, eventId: string, amountRefunded: number) {
  return {
    id: eventId,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_${eventId}`,
        payment_intent: intentId,
        amount_refunded: amountRefunded,
        currency: 'usd',
      },
    },
  } as any;
}

async function postWebhook(event: unknown) {
  mockConstructEvent.mockReturnValue(event as any);
  return request(app)
    .post('/api/v1/webhooks/stripe')
    .set('stripe-signature', 'test-signature-value') // value is irrelevant — constructEvent is mocked
    .send({ irrelevant: 'raw body content, since verification is mocked' });
}

describe('POST /api/v1/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a request with no stripe-signature header', async () => {
    const res = await request(app).post('/api/v1/webhooks/stripe').send({ foo: 'bar' });
    expect(res.status).toBe(400);
  });

  it('rejects when signature verification itself fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });

    const res = await request(app)
      .post('/api/v1/webhooks/stripe')
      .set('stripe-signature', 'bad-signature')
      .send({ foo: 'bar' });

    expect(res.status).toBe(400);
  });

  describe('payment_intent.succeeded', () => {
    it('marks the order paid, decrements stock, clears the cart, and records a succeeded Transaction', async () => {
      const { orderId, userId, intentId, product } = await setupPendingOrder({ stock: 10, priceCents: 1000, quantity: 3 });

      const res = await postWebhook(paymentIntentSucceededEvent(orderId, userId, intentId, 'evt_1', 3000));
      expect(res.status).toBe(200);

      const order = await Order.findById(orderId);
      expect(order?.status).toBe('paid');

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct?.stock).toBe(7); // 10 - 3

      const cart = await Cart.findOne({ userId });
      expect(cart?.items).toHaveLength(0);

      const transaction = await Transaction.findOne({ stripeEventId: 'evt_1' });
      expect(transaction?.type).toBe('payment');
      expect(transaction?.status).toBe('succeeded');
    });

    it('is idempotent: redelivering the same event does not double-decrement stock or create a duplicate Transaction', async () => {
      const { orderId, userId, intentId, product } = await setupPendingOrder({ stock: 10, priceCents: 1000, quantity: 3 });
      const event = paymentIntentSucceededEvent(orderId, userId, intentId, 'evt_dup', 3000);

      await postWebhook(event);
      const secondRes = await postWebhook(event); // exact same event.id, simulating Stripe redelivery

      expect(secondRes.status).toBe(200); // still acknowledged, not an error

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct?.stock).toBe(7); // decremented ONCE, not twice

      const transactionCount = await Transaction.countDocuments({ stripeEventId: 'evt_dup' });
      expect(transactionCount).toBe(1);
    });

    it('gracefully acknowledges (200) an event missing orderId/userId metadata, without crashing', async () => {
      const res = await postWebhook({
        id: 'evt_no_metadata',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_orphan', amount: 1000, currency: 'usd', metadata: {} } },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('marks the order failed WITHOUT touching cart or stock', async () => {
      const { orderId, userId, intentId, product } = await setupPendingOrder({ stock: 10, priceCents: 1000, quantity: 3 });

      const res = await postWebhook(paymentIntentFailedEvent(orderId, userId, intentId, 'evt_fail_1', 3000));
      expect(res.status).toBe(200);

      const order = await Order.findById(orderId);
      expect(order?.status).toBe('failed');

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct?.stock).toBe(10); // untouched

      const cart = await Cart.findOne({ userId });
      expect(cart?.items).toHaveLength(1); // untouched — user can retry
    });
  });

  describe('charge.refunded', () => {
    it('marks the order refunded, records a refund Transaction, and does NOT restock inventory', async () => {
      const { orderId, userId, intentId, product } = await setupPendingOrder({ stock: 10, priceCents: 1000, quantity: 3 });

      // Payment must succeed first before it can be refunded.
      await postWebhook(paymentIntentSucceededEvent(orderId, userId, intentId, 'evt_succeed_1', 3000));

      const res = await postWebhook(chargeRefundedEvent(intentId, 'evt_refund_1', 3000));
      expect(res.status).toBe(200);

      const order = await Order.findById(orderId);
      expect(order?.status).toBe('refunded');

      const refundTransaction = await Transaction.findOne({ stripeEventId: 'evt_refund_1' });
      expect(refundTransaction?.type).toBe('refund');
      expect(refundTransaction?.status).toBe('succeeded');

      // Stock stays at whatever it was after the sale — refunding is deliberately NOT an
      // automatic restock (see webhook.service.ts's comment on why).
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct?.stock).toBe(7);
    });
  });

  it('acknowledges (200) an unrecognized event type without doing anything', async () => {
    const res = await postWebhook({ id: 'evt_unknown', type: 'customer.created', data: { object: {} } });
    expect(res.status).toBe(200);
  });
});