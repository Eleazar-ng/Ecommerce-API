import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';
import { createAdminAndLogin, createCategory } from '../helpers/product.helpers.js';

describe('Product CRUD', () => {
  it('auto-generates a slug from name, and appends -2 on collision', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_products']);
    const category = await createCategory();

    const first = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Trail Shoes', priceCents: 1000, categoryId: category._id.toString() });

    const second = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Trail Shoes', priceCents: 1200, categoryId: category._id.toString() });

    expect(first.body.data.slug).toBe('trail-shoes');
    expect(second.body.data.slug).toBe('trail-shoes-2');
  });

  it('a plain user cannot create a product', async () => {
    const signupRes = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
    const userToken = signupRes.body.data.accessToken as string;
    const category = await createCategory();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: 'Test', priceCents: 1000, categoryId: category._id.toString() });

    expect(res.status).toBe(403);
  });

  it('manage_products and manage_inventory are independently enforced: an admin with ONLY manage_inventory cannot create a product', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_inventory']);
    const category = await createCategory();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Test', priceCents: 1000, categoryId: category._id.toString() });

    expect(res.status).toBe(403);
  });

  it('the reverse boundary: an admin with ONLY manage_products cannot update stock', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_products']);
    const category = await createCategory();

    const createRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Test', priceCents: 1000, categoryId: category._id.toString() });

    const res = await request(app)
      .patch(`/api/v1/products/${createRes.body.data._id}/stock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stock: 50 });

    expect(res.status).toBe(403);
  });

  it('soft delete hides a product from public listing but keeps it visible to an admin with includeInactive=true', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_products']);
    const category = await createCategory();

    const createRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Deleteme', priceCents: 1000, categoryId: category._id.toString() });
    const productId = createRes.body.data._id as string;

    const deleteRes = await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(200);

    const publicList = await request(app).get('/api/v1/products');
    const foundPublicly = publicList.body.data.find((p: { _id: string }) => p._id === productId);
    expect(foundPublicly).toBeUndefined();

    const adminList = await request(app)
      .get('/api/v1/products?includeInactive=true')
      .set('Authorization', `Bearer ${accessToken}`);
    const foundByAdmin = adminList.body.data.find((p: { _id: string }) => p._id === productId);
    expect(foundByAdmin).toBeDefined();
  });

  it('a stock field in the general update body is silently stripped — stock only ever changes via PATCH /:id/stock', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_products']);
    const category = await createCategory();

    const createRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Test', priceCents: 1000, stock: 10, categoryId: category._id.toString() });
    const productId = createRes.body.data._id as string;

    await request(app)
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ priceCents: 2000, stock: 999 });

    const getRes = await request(app).get(`/api/v1/products/${productId}`);
    expect(getRes.body.data.priceCents).toBe(2000);
    expect(getRes.body.data.stock).toBe(10); // unchanged, despite being in the request body
  });
});