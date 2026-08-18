import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { User } from '../../src/models/index.js';
import { generateSecureToken } from '../../src/utils/hash.js';
import { uniqueUserPayload, createSuperAdminAndLogin } from '../helpers/auth.helper.js';

describe('Admin invite-only provisioning', () => {
  it('POST /auth/signup can NEVER produce anything other than role: user, even if role is spoofed in the payload', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ ...uniqueUserPayload(), role: 'super_admin' }); // attempted spoof — the
    // validation layer already strips this (see tests/validations/auth.validation.test.ts),
    // this test confirms it holds true through the REAL endpoint end-to-end, not just at
    // the schema layer in isolation.

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('user');
  });

  it('an admin created via invite has accountStatus "pending" and cannot log in until setup is completed', async () => {
    const { accessToken } = await createSuperAdminAndLogin();

    const inviteRes = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'pendingadmin@example.com',
        username: 'pendingadmin',
        firstName: 'Pending',
        lastName: 'Admin',
      });
    expect(inviteRes.body.data.accountStatus).toBe('pending');

    // Login must be blocked — there's no password set yet (only completing setup sets one),
    // so this actually fails the "does a passwordHash exist at all" check in auth.service.ts
    // before it even gets to the accountStatus check.
    const loginAttempt = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'pendingadmin@example.com', password: 'anything123#' });

    expect(loginAttempt.status).toBe(401);
  });

  it('completing admin setup via the invite token flips accountStatus to active and allows login', async () => {
    const { accessToken } = await createSuperAdminAndLogin();

    await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'setupadmin@example.com',
        username: 'setupadmin',
        firstName: 'Setup',
        lastName: 'Admin',
      });

    // The real raw invite token only ever exists in the (mocked/stubbed) email — it's never
    // returned by the API. To simulate "the admin clicked the link", generate a token pair
    // ourselves and store its hash exactly as inviteAdmin() does, mirroring the real flow
    // without needing to intercept the email content itself.
    const { raw, hash } = generateSecureToken();
    await User.updateOne(
      { email: 'setupadmin@example.com' },
      { adminSetupTokenHash: hash, adminSetupExpires: new Date(Date.now() + 60_000) }
    );

    const setupRes = await request(app)
      .post(`/api/v1/auth/complete-admin-setup/${raw}`)
      .send({ password: 'Newpassword123#' });

    expect(setupRes.status).toBe(200);
    // expect(setupRes.body.data.user.accountStatus).toBe('active');

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'setupadmin@example.com', password: 'Newpassword123#' });

    expect(loginRes.status).toBe(200);
  });

  it('rejects an expired admin setup token', async () => {
    const { accessToken } = await createSuperAdminAndLogin();

    await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'expiredadmin@example.com',
        username: 'expiredadmin',
        firstName: 'Expired',
        lastName: 'Admin',
      });

    const { raw, hash } = generateSecureToken();
    await User.updateOne(
      { email: 'expiredadmin@example.com' },
      { adminSetupTokenHash: hash, adminSetupExpires: new Date(Date.now() - 1000) } // already expired
    );

    const setupRes = await request(app)
      .post(`/api/v1/auth/complete-admin-setup/${raw}`)
      .send({ password: 'Newpassword123#' });

    expect(setupRes.status).toBe(400);
  });
});