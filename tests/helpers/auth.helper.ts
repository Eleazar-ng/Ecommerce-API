import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/models/index.js';
import { hashPassword } from '../../src/utils/hash.js';

// Creates a super_admin DIRECTLY in the DB, bypassing HTTP entirely — mirrors exactly what
// src/seeders/superAdmin.seeder.ts does in real life, since there's no endpoint that could
// ever produce a super_admin (by design — see Stage 3). Each call uses a unique email so
// multiple tests in the same file/suite don't collide on the unique index.
let counter = 0;

export async function createSuperAdminAndLogin() {
  counter += 1;
  const email = `super${counter}@example.com`;
  const username = `superadmin${counter}`;
  const password = 'Superpassword123#';

  const passwordHash = await hashPassword(password);
  await User.create({
    email,
    username,
    passwordHash,
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
    accountStatus: 'active',
    isEmailVerified: true,
  });

  const loginRes = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });

  return {
    accessToken: loginRes.body.data.accessToken as string,
    email,
  };
}

export function uniqueUserPayload(overrides: Partial<Record<string, string>> = {}) {
  counter += 1;
  return {
    email: `user${counter}@example.com`,
    username: `testuser${counter}`,
    password: 'Password123#',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  };
}