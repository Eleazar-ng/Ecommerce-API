import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';
import { createAdminAndLogin, createCategory, createProduct } from '../helpers/product.helpers.js';
import { createOrder } from '../helpers/order.helpers.js';

async function userId() {
  const res = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
  return res.body.data.user.id as string;
}

describe('GET /api/v1/dashboard', () => {
  it('a plain user cannot access the dashboard', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
    const token = res.body.data.accessToken as string;

    const dashRes = await request(app).get('/api/v1/dashboard').set('Authorization', `Bearer ${token}`);
    expect(dashRes.status).toBe(403);
  });

  it('any admin can access the dashboard, with no specific permission required beyond the role itself', async () => {
    // Deliberately created with NO permissions array at all — dashboard access is gated
    // purely by role (admin/super_admin), unlike manage_orders/manage_inventory/etc.
    const { accessToken } = await createAdminAndLogin([]);

    const res = await request(app).get('/api/v1/dashboard').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('revenue sums only paid/shipped/delivered orders, excluding pending/failed/refunded/cancelled', async () => {
    const { accessToken } = await createAdminAndLogin([]);
    const uid = await userId();

    await createOrder(uid, { status: 'paid', totalCents: 1000 });
    await createOrder(uid, { status: 'shipped', totalCents: 2000 });
    await createOrder(uid, { status: 'delivered', totalCents: 3000 });
    // None of these should count toward revenue:
    await createOrder(uid, { status: 'pending', totalCents: 5000 });
    await createOrder(uid, { status: 'failed', totalCents: 5000 });
    await createOrder(uid, { status: 'refunded', totalCents: 5000 });
    await createOrder(uid, { status: 'cancelled', totalCents: 5000 });

    const res = await request(app).get('/api/v1/dashboard').set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.totalRevenueCents).toBe(6000); // 1000 + 2000 + 3000, nothing else
    expect(res.body.data.totalOrders).toBe(7); // counts EVERY order regardless of status
  });

  it('respects a custom lowStockThreshold query param', async () => {
    const { accessToken } = await createAdminAndLogin([]);
    const category = await createCategory();
    await createProduct(category._id.toString(), { stock: 3 });
    await createProduct(category._id.toString(), { stock: 8 });

    const defaultRes = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(defaultRes.body.data.lowStockCount).toBe(1); // default threshold 5, only the stock:3 product qualifies

    const customRes = await request(app)
      .get('/api/v1/dashboard?lowStockThreshold=10')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(customRes.body.data.lowStockCount).toBe(2); // both qualify under threshold 10
  });
});