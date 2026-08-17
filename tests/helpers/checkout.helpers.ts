import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/index.js';
import { uniqueUserPayload } from './auth.helper.js';
import { createCategory, createProduct } from './product.helpers.js';

export const validShippingAddress = {
  line1: '123 Test St',
  city: 'Testville',
  postalCode: '00000',
  country: 'US',
};

interface ScenarioOverrides {
  stock?: number;
  priceCents?: number;
  quantity?: number;
  verifyEmail?: boolean;
}

// Creates a user (optionally email-verified, since that's a real checkout gate worth
// testing both ways), a product, and adds it to that user's cart — the common starting
// point every checkout test needs.
export async function setupCheckoutScenario(overrides: ScenarioOverrides = {}) {
  const payload = uniqueUserPayload();
  const signupRes = await request(app).post('/api/v1/auth/signup').send(payload);
  const accessToken = signupRes.body.data.accessToken as string;
  const userId = signupRes.body.data.user.id as string;

  if (overrides.verifyEmail ?? true) {
    await User.updateOne({ _id: userId }, { isEmailVerified: true });
  }

  const category = await createCategory();
  const product = await createProduct(category._id.toString(), {
    stock: overrides.stock ?? 10,
    priceCents: overrides.priceCents ?? 1000,
  });

  await request(app)
    .post('/api/v1/cart/items')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ productId: product._id.toString(), quantity: overrides.quantity ?? 2 });

  return { accessToken, userId, product };
}