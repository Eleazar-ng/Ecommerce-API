import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mocked at the module boundary — checkout.service.ts imports { stripe } from this exact
// path. Every method the codebase actually calls is stubbed here; individual tests
// configure return values per-case.
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
import { Order } from '../../src/models/index.js';
import { setupCheckoutScenario, validShippingAddress } from '../helpers/checkout.helpers.js';

const mockCreate = vi.mocked(stripe.paymentIntents.create);
const mockRetrieve = vi.mocked(stripe.paymentIntents.retrieve);
const mockCancel = vi.mocked(stripe.paymentIntents.cancel);

function fakeIntent(overrides: Partial<{ id: string; client_secret: string; status: string }> = {}) {
  return {
    id: overrides.id ?? 'pi_test_1',
    client_secret: overrides.client_secret ?? 'pi_test_1_secret_abc',
    status: overrides.status ?? 'requires_payment_method',
  } as any;
}

describe('POST /api/v1/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(fakeIntent());
  });

  it('creates a pending order with a server-computed total, ignoring any client-sent pricing field', async () => {
    const { accessToken } = await setupCheckoutScenario({ priceCents: 1500, quantity: 2 });

    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      // totalCents here is an attempted spoof — checkoutSchema doesn't even declare this
      // field, so Zod strips it before the controller ever sees it.
      .send({ shippingAddress: validShippingAddress, totalCents: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.amountCents).toBe(3000); // 1500 * 2, computed server-side, not the spoofed 1
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate.mock.calls[0][0].amount).toBe(3000);

    const order = await Order.findById(res.body.data.orderId);
    expect(order?.status).toBe('pending');
    expect(order?.stripePaymentIntentId).toBe('pi_test_1');
  });

  it('rejects checkout for an unverified email, before ever touching Stripe', async () => {
    const { accessToken } = await setupCheckoutScenario({ verifyEmail: false });

    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: validShippingAddress });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects checkout with an empty cart', async () => {
    const { accessToken } = await setupCheckoutScenario();
    await request(app).delete('/api/v1/cart').set('Authorization', `Bearer ${accessToken}`);

    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: validShippingAddress });

    expect(res.status).toBe(400);
  });

  it('hard-rejects when stock dropped below cart quantity since the item was added (the Option C hard check)', async () => {
    const { accessToken, product } = await setupCheckoutScenario({ stock: 10, quantity: 5 });

    // Someone else buys most of the stock between add-to-cart and checkout.
    product.stock = 2;
    await product.save();

    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: validShippingAddress });

    expect(res.status).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('hard-rejects when the product was deactivated since it was added to cart', async () => {
    const { accessToken, product } = await setupCheckoutScenario();
    product.isActive = false;
    await product.save();

    const res = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: validShippingAddress });

    expect(res.status).toBe(409);
  });

  describe('idempotency guard (the double-checkout bug fix)', () => {
    it('calling checkout twice with an unchanged cart returns the SAME order and clientSecret, not a duplicate', async () => {
      const { accessToken } = await setupCheckoutScenario();

      const first = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress: validShippingAddress });

      // Second call: the existing PaymentIntent is still open, not yet confirmed.
      mockRetrieve.mockResolvedValue(fakeIntent({ status: 'requires_payment_method' }));

      const second = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress: validShippingAddress });

      expect(second.status).toBe(201);
      expect(second.body.data.orderId).toBe(first.body.data.orderId);
      expect(second.body.data.clientSecret).toBe(first.body.data.clientSecret);
      // Only ONE PaymentIntent should ever have been created — the second call reused it.
      expect(mockCreate).toHaveBeenCalledOnce();

      const orderCount = await Order.countDocuments({});
      expect(orderCount).toBe(1);
    });

    it('rejects a second checkout attempt if the existing PaymentIntent already succeeded, preventing a double charge', async () => {
      const { accessToken } = await setupCheckoutScenario();

      await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress: validShippingAddress });

      // Simulate: the webhook for the first payment just hasn't landed yet, but Stripe's
      // own record already shows it succeeded.
      mockRetrieve.mockResolvedValue(fakeIntent({ status: 'succeeded' }));

      const second = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress: validShippingAddress });

      expect(second.status).toBe(409);
      expect(mockCreate).toHaveBeenCalledOnce(); // only the first call ever created an intent

      const orderCount = await Order.countDocuments({});
      expect(orderCount).toBe(1);
    });

    it('supersedes a stale pending order when the cart has changed: cancels the old intent, marks the old order cancelled, creates a fresh one', async () => {
      const { accessToken, product } = await setupCheckoutScenario({ quantity: 2 });

      const first = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress: validShippingAddress });

      // Cart changes after the first checkout call — add another unit.
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product._id.toString(), quantity: 1 });

      mockRetrieve.mockResolvedValue(fakeIntent({ status: 'requires_payment_method' }));
      mockCreate.mockResolvedValue(fakeIntent({ id: 'pi_test_2', client_secret: 'pi_test_2_secret_abc' }));

      const second = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress: validShippingAddress });
      console.log(second.body)
      expect(second.status).toBe(201);
      expect(second.body.data.orderId).not.toBe(first.body.data.orderId);
      expect(mockCancel).toHaveBeenCalledWith('pi_test_1');

      const oldOrder = await Order.findById(first.body.data.orderId);
      expect(oldOrder?.status).toBe('cancelled');

      const newOrder = await Order.findById(second.body.data.orderId);
      expect(newOrder?.status).toBe('pending');
    });
  });
});