import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import Stripe from 'stripe';

vi.mock('../../src/config/stripe.js', () => ({
  stripe: {
    paymentIntents: { create: vi.fn(), retrieve: vi.fn(), cancel: vi.fn() },
    refunds: { create: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  },
}));

import app from '../../src/app.js';
import { stripe } from '../../src/config/stripe.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';
import { createAdminAndLogin } from '../helpers/product.helpers.js';
import { createOrder } from '../helpers/order.helpers.js';

const mockRefundCreate = vi.mocked(stripe.refunds.create);

async function signupUser() {
  const res = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
  return res.body.data.user.id as string;
}

describe('POST /api/v1/orders/all/:id/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initiates a refund for a paid order and returns 202 (async — status updates via webhook, not this response)', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const userId = await signupUser();
    const order = await createOrder(userId, { status: 'paid', stripePaymentIntentId: 'pi_refund_1' });

    mockRefundCreate.mockResolvedValue({ id: 're_1', status: 'succeeded' } as any);

    const res = await request(app)
      .post(`/api/v1/orders/all/${order._id}/refund`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(202);
    expect(res.body.data.refundId).toBe('re_1');
    expect(mockRefundCreate).toHaveBeenCalledWith({ payment_intent: 'pi_refund_1' });
  });

  it('rejects refunding an order that was never paid', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const userId = await signupUser();
    const order = await createOrder(userId, { status: 'pending' });

    const res = await request(app)
      .post(`/api/v1/orders/all/${order._id}/refund`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(mockRefundCreate).not.toHaveBeenCalled();
  });

  it('rejects an order with no associated PaymentIntent', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const userId = await signupUser();
    const order = await createOrder(userId, { status: 'paid' }); // no stripePaymentIntentId

    const res = await request(app)
      .post(`/api/v1/orders/all/${order._id}/refund`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
  });

  it('translates a Stripe rejection (e.g. already fully refunded) into a clean 409, not a raw 500', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const userId = await signupUser();
    const order = await createOrder(userId, { status: 'paid', stripePaymentIntentId: 'pi_already_refunded' });

    mockRefundCreate.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({ message: 'Charge already refunded' } as any)
    );

    const res = await request(app)
      .post(`/api/v1/orders/all/${order._id}/refund`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Charge already refunded');
  });

  it('a plain user cannot initiate a refund', async () => {
    const userSignup = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
    const token = userSignup.body.data.accessToken as string;
    const userId = userSignup.body.data.user.id as string;
    const order = await createOrder(userId, { status: 'paid', stripePaymentIntentId: 'pi_x' });

    const res = await request(app)
      .post(`/api/v1/orders/all/${order._id}/refund`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});