import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/email.service.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendAdminInviteEmail: vi.fn(),
}));

import app from '../../src/app.js';
import { User } from '../../src/models/index.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';

describe('POST /api/v1/auth/login', () => {
  const payload = uniqueUserPayload();

  beforeEach(async () => {
    await request(app).post('/api/v1/auth/signup').send(payload);
  });

  it('logs in with correct email + password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: payload.email, password: payload.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('logs in with username instead of email — one endpoint, either credential', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: payload.username, password: payload.password });

    expect(res.status).toBe(200);
  });

  it('rejects wrong password with a generic message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: payload.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('rejects a nonexistent identifier with the SAME message as wrong password — prevents an attacker distinguishing "wrong password" from "no such account"', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'nobody-at-all@example.com', password: 'whatever123' });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('rejects login for a suspended account', async () => {
    await User.updateOne({ email: payload.email }, { isSuspended: true });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: payload.email, password: payload.password });

    expect(res.status).toBe(403);
  });
});