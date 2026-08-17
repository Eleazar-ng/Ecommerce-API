import { describe, it, expect } from 'vitest';
import request from 'supertest';

import app from '../../src/app.js';
import { User } from '../../src/models/index.js';
import { uniqueUserPayload, createSuperAdminAndLogin } from '../helpers/auth.helper.js';

describe('RBAC boundaries', () => {
  it('a plain user cannot access a super_admin-only route (POST /admin/admins)', async () => {
    const signupRes = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
    const userToken = signupRes.body.data.accessToken as string;

    const res = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ email: 'x@example.com', username: 'xuser', firstName: 'X', lastName: 'Y' });

    expect(res.status).toBe(403);
  });

  it('an unauthenticated request to a protected route is rejected with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('a super_admin CAN access the admin-management route', async () => {
    const { accessToken } = await createSuperAdminAndLogin();

    const res = await request(app)
      .post('/api/v1/admin/admins')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'newlyinvited@example.com',
        username: 'newlyinvited',
        firstName: 'New',
        lastName: 'Admin',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.accountStatus).toBe('pending');
  });

  it("a suspended user's EXISTING access token is rejected on the very next request — not just at login", async () => {
    const payload = uniqueUserPayload();
    const signupRes = await request(app).post('/api/v1/auth/signup').send(payload);
    const token = signupRes.body.data.accessToken as string;

    // Confirm the token works before suspension.
    const beforeRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(beforeRes.status).toBe(200);

    // Suspend directly in the DB, simulating an admin action elsewhere.
    await User.updateOne({ email: payload.email }, { isSuspended: true });

    // Same, still-unexpired token should now be rejected — proves the `protect` middleware
    // re-checks isSuspended against the DB on every request, not just at login time (see
    // auth.middleware.ts).
    const afterRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(afterRes.status).toBe(403);
  });
});