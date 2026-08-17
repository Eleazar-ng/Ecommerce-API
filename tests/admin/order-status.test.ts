import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';
import { createAdminAndLogin } from '../helpers/product.helpers.js';
import { createOrder } from '../helpers/order.helpers.js';

async function signupUser() {
  const res = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
  return { token: res.body.data.accessToken as string, userId: res.body.data.user.id as string };
}

describe('PATCH /api/v1/orders/all/:id/status', () => {
  it('allows paid -> shipped', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const { userId } = await signupUser();
    const order = await createOrder(userId, { status: 'paid' });

    const res = await request(app)
      .patch(`/api/v1/orders/all/${order._id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'shipped' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('shipped');
  });

  it('allows shipped -> delivered', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const { userId } = await signupUser();
    const order = await createOrder(userId, { status: 'shipped' });

    const res = await request(app)
      .patch(`/api/v1/orders/all/${order._id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('delivered');
  });

  it('rejects pending -> shipped — skipping payment confirmation entirely', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const { userId } = await signupUser();
    const order = await createOrder(userId, { status: 'pending' });

    const res = await request(app)
      .patch(`/api/v1/orders/all/${order._id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'shipped' });

    expect(res.status).toBe(409);
  });

  it('rejects paid -> delivered — skipping the shipped step', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const { userId } = await signupUser();
    const order = await createOrder(userId, { status: 'paid' });

    const res = await request(app)
      .patch(`/api/v1/orders/all/${order._id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'delivered' });

    expect(res.status).toBe(409);
  });

  it('rejects any transition out of the terminal "delivered" state', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);
    const { userId } = await signupUser();
    const order = await createOrder(userId, { status: 'delivered' });

    const res = await request(app)
      .patch(`/api/v1/orders/all/${order._id}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'shipped' });

    expect(res.status).toBe(409);
  });

  it('rejects a plain user entirely (403), before the transition rule is even evaluated', async () => {
    const { token, userId } = await signupUser();
    const order = await createOrder(userId, { status: 'paid' });

    const res = await request(app)
      .patch(`/api/v1/orders/all/${order._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped' });

    expect(res.status).toBe(403);
  });
});