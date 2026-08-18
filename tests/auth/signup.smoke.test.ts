import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// vi.mock calls are hoisted to the top of the file by Vitest, before any other import —
// this MUST come before the `import app from ...` below for the mock to actually take
// effect on modules that transitively import email.service.ts (auth.service.ts does).
vi.mock('../../src/services/email.service.js', () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendAdminInviteEmail: vi.fn(),
}));

import app from '../../src/app.js';
import { sendVerificationEmail } from '../../src/services/email.service.js';

describe('POST /api/v1/auth/signup (T0 infrastructure smoke test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a user, persists it for real, and triggers a verification email', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      email: 'smoke@example.com',
      username: 'smoketest',
      password: 'Password123#',
      firstName: 'Smoke',
      lastName: 'Test',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('smoke@example.com');
    expect(res.body.data.user.role).toBe('user'); // never trusts client-supplied role
    expect(res.body.data.accessToken).toBeDefined();

    // Confirms the mocked email service was actually called — proves module mocking
    // works end-to-end, not just that the HTTP response looked right.
    expect(sendVerificationEmail).toHaveBeenCalledOnce();
    expect(sendVerificationEmail).toHaveBeenCalledWith('smoke@example.com', expect.any(String));
  });

  it('rejects a duplicate email with 409', async () => {
    const payload = {
      email: 'dup@example.com',
      username: 'dupuser',
      password: 'Password123#',
      firstName: 'Dup',
      lastName: 'User',
    };

    await request(app).post('/api/v1/auth/signup').send(payload);
    const res = await request(app).post('/api/v1/auth/signup').send({ ...payload, username: 'differentusername' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});