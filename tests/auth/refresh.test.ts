import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { Response } from 'supertest';

import app from '../../src/app.js';
import { uniqueUserPayload } from '../helpers/auth.helper.js';

function extractCookies(res: Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[]) ?? [];
}

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token — a new cookie is issued, different from the old one', async () => {
    const signupRes = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
    console.log(signupRes.statusCode)
    const cookies = extractCookies(signupRes);
    console.log(cookies[0])

    const refreshRes = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    console.log(refreshRes.status)

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    const newCookies = extractCookies(refreshRes);
    console.log(newCookies[0])
    expect(newCookies[0]).not.toEqual(cookies[0]);
  });

  it('rejects a request with no refresh cookie at all', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('detects reuse of an already-rotated refresh token and invalidates the whole session', async () => {
    const signupRes = await request(app).post('/api/v1/auth/signup').send(uniqueUserPayload());
    const originalCookies = extractCookies(signupRes);

    // First refresh: legitimate, rotates the stored hash to a new token.
    const firstRefresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalCookies);
    expect(firstRefresh.status).toBe(200);

    // Second refresh using the OLD (now-rotated-away) cookie — simulates a stolen refresh
    // token being replayed after the legitimate owner already refreshed once.
    const replayAttempt = await request(app).post('/api/v1/auth/refresh').set('Cookie', originalCookies);
    expect(replayAttempt.status).toBe(401);

    // Confirms the session was actually torn down, not just this one bad request rejected —
    // even the NEW, legitimately-rotated token from the first refresh should no longer work,
    // since reuse detection clears refreshTokenHash entirely rather than just denying the
    // specific stale token.
    const newCookiesFromFirstRefresh = extractCookies(firstRefresh);
    const attemptWithNewToken = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', newCookiesFromFirstRefresh);
    expect(attemptWithNewToken.status).toBe(401);
  });
});