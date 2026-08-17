import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { createAdminAndLogin } from '../helpers/product.helpers.js';

describe('Category', () => {
  it('blocks deleting a category that still has an active product referencing it', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_categories', 'manage_products']);

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Shoes' });
    const categoryId = catRes.body.data._id as string;

    await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Trail Runner', priceCents: 1000, categoryId });

    const deleteRes = await request(app)
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.error.message).toContain('active product');
  });

  it('allows deleting a category once its only product has been deactivated', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_categories', 'manage_products']);

    const catRes = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Accessories' });
    const categoryId = catRes.body.data._id as string;

    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Belt', priceCents: 500, categoryId });
    const productId = productRes.body.data._id as string;

    await request(app)
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    const deleteRes = await request(app)
      .delete(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(200);
  });

  it('auto-generates a category slug with collision handling', async () => {
    const { accessToken } = await createAdminAndLogin(['manage_categories']);

    const first = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Outdoor' });
    const second = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Outdoor' });

    expect(first.body.data.slug).toBe('outdoor');
    expect(second.body.data.slug).toBe('outdoor-2');
  });
});