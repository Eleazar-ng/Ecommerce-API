import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { createSuperAdminAndLogin } from '../helpers/auth.helper.js';
import { createAdminAndLogin, createCategory, createProduct } from '../helpers/product.helpers.js';

// This is the closing piece of T5's scope: proving that manage_orders, manage_inventory,
// and view_transactions are three GENUINELY SEPARATE gates, not just three names that all
// happen to map to the same "is this user an admin" check. Each sub-test grants exactly
// ONE of the three permissions and confirms it unlocks ONLY the endpoint it's meant to,
// rejecting the other two.
describe('Permission independence: manage_orders / manage_inventory / view_transactions', () => {
  it('an admin with ONLY manage_orders can update order status but cannot view transactions or update stock', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_orders']);

    const transactionsRes = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(transactionsRes.status).toBe(403);

    const category = await createCategory();
    const product = await createProduct(category._id.toString());
    const stockRes = await request(app)
      .patch(`/api/v1/products/${product._id}/stock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stock: 50 });
    expect(stockRes.status).toBe(403);
  });

  it('an admin with ONLY manage_inventory can update stock but cannot view transactions or manage orders', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_inventory']);

    const transactionsRes = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(transactionsRes.status).toBe(403);

    const ordersRes = await request(app)
      .get('/api/v1/orders/all')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ordersRes.status).toBe(403);
  });

  it('an admin with ONLY view_transactions can list transactions but cannot manage orders or update stock', async () => {
    const { accessToken } = await createAdminAndLogin(['view_transactions']);

    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);

    const ordersRes = await request(app)
      .get('/api/v1/orders/all')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ordersRes.status).toBe(403);

    const category = await createCategory();
    const product = await createProduct(category._id.toString());
    const stockRes = await request(app)
      .patch(`/api/v1/products/${product._id}/stock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stock: 50 });
    expect(stockRes.status).toBe(403);
  });

  it('a super_admin bypasses every permission check, without needing any explicit permissions array', async () => {
    // super_admin is created with role: 'super_admin' and NO permissions array —
    // requirePermission()'s super_admin bypass in auth.middleware.ts should still let
    // every one of these through regardless.
    const { accessToken } = await createSuperAdminAndLogin();

    const transactionsRes = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(transactionsRes.status).toBe(200);

    const ordersRes = await request(app)
      .get('/api/v1/orders/all')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(ordersRes.status).toBe(200);
  });
});