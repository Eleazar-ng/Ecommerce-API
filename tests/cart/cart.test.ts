import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';
import { createCategory, createProduct } from '../helpers/product.helpers.js';

async function signupUser() {
  const res = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
  return res.body.data.accessToken as string;
}

describe('Cart', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/cart');
    expect(res.status).toBe(401);
  });

  it('adding the same product twice increments quantity rather than creating a duplicate line item', async () => {
    const token = await signupUser();
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), { stock: 10 });

    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 3 });

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(5);
  });

  it('rejects adding more than available stock, mentioning quantity already in cart', async () => {
    const token = await signupUser();
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), { stock: 5 });

    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 3 });

    // 3 already in cart + 3 more requested = 6, exceeds stock of 5
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 3 });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('you already have 3');
  });

  it('removing an item not in the cart is idempotent — 200, not 404', async () => {
    const token = await signupUser();
    const category = await createCategory();
    const product = await createProduct(category._id.toString());

    const res = await request(app)
      .delete(`/api/v1/cart/items/${product._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('a deactivated product stays in the cart but is flagged unavailable and excluded from totals', async () => {
    const token = await signupUser();
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), { stock: 10, priceCents: 1000 });

    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 2 });

    // Deactivate directly, simulating an admin action elsewhere.
    product.isActive = false;
    await product.save();

    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1); // still shown, not silently removed
    expect(res.body.data.items[0].available).toBe(false);
    expect(res.body.data.subtotalCents).toBe(0);
    expect(res.body.data.itemCount).toBe(0);
  });

  it('an item whose stock drops below cart quantity is flagged unavailable too, not just deactivated products', async () => {
    const token = await signupUser();
    const category = await createCategory();
    const product = await createProduct(category._id.toString(), { stock: 10 });

    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 5 });

    // Simulate stock dropping below what's in the cart (e.g. someone else bought the rest).
    product.stock = 2;
    await product.save();

    const res = await request(app).get('/api/v1/cart').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.items[0].available).toBe(false);
  });

  it('clearing the cart empties all items', async () => {
    const token = await signupUser();
    const category = await createCategory();
    const product = await createProduct(category._id.toString());

    await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product._id.toString(), quantity: 1 });

    const res = await request(app).delete('/api/v1/cart').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});