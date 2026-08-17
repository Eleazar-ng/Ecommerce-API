import request from 'supertest';
import app from '../../src/app.js';
import { User, Category, Product } from '../../src/models/index.js';
import { hashPassword } from '../../src/utils/hash.js';

let counter = 0;

// Creates an admin DIRECTLY in the DB with a specific set of permissions, bypassing the
// full invite+setup-token flow (already thoroughly covered in
// tests/auth/admin-invite.test.ts) — T3 cares about product/cart authorization boundaries,
// not re-exercising invite mechanics.
export async function createAdminAndLogin(permissions: string[] = []) {
  counter += 1;
  const email = `admin${counter}@example.com`;
  const username = `adminuser${counter}`;
  const password = 'Adminpassword123#';

  const passwordHash = await hashPassword(password);
  await User.create({
    email,
    username,
    passwordHash,
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    permissions,
    accountStatus: 'active',
    isEmailVerified: true,
  });

  const loginRes = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });

  return { accessToken: loginRes.body.data.accessToken as string, email };
}

export async function createCategory(
  overrides: Partial<{ name: string; slug: string; isActive: boolean }> = {}
) {
  counter += 1;
  return Category.create({
    name: overrides.name ?? `Category ${counter}`,
    slug: overrides.slug ?? `category-${counter}`,
    isActive: overrides.isActive ?? true,
  });
}

export async function createProduct(
  categoryId: string,
  overrides: Partial<{ name: string; priceCents: number; stock: number; isActive: boolean }> = {}
) {
  counter += 1;
  return Product.create({
    name: overrides.name ?? `Product ${counter}`,
    slug: `product-${counter}`,
    priceCents: overrides.priceCents ?? 1000,
    stock: overrides.stock ?? 10,
    categoryId,
    isActive: overrides.isActive ?? true,
  });
}