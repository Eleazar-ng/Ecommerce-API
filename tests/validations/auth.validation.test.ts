import { describe, it, expect } from 'vitest';
import { signupSchema } from '../../src/validations/auth.validation.js';

describe('signupSchema', () => {
  const validBody = {
    email: 'test@example.com',
    username: 'testuser',
    password: 'Password123#',
    firstName: 'Test',
    lastName: 'User',
  };

  it('accepts a valid signup payload', () => {
    const result = signupSchema.safeParse({ body: validBody });
    expect(result.success).toBe(true);
  });

  it('strips an unexpected "role" field instead of passing it through — signup can only ever produce a plain user, by design (see auth.service.ts)', () => {
    const result = signupSchema.safeParse({ body: { ...validBody, role: 'admin' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).not.toHaveProperty('role');
    }
  });

  it('rejects a password under 8 characters', () => {
    const result = signupSchema.safeParse({ body: { ...validBody, password: 'short' } });
    expect(result.success).toBe(false);
  });

  it('rejects a username with disallowed characters', () => {
    const result = signupSchema.safeParse({ body: { ...validBody, username: 'bad username!' } });
    expect(result.success).toBe(false);
  });

  it('accepts a username with allowed special characters ( . _ - )', () => {
    const result = signupSchema.safeParse({ body: { ...validBody, username: 'test.user_name-1' } });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email format', () => {
    const result = signupSchema.safeParse({ body: { ...validBody, email: 'not-an-email' } });
    expect(result.success).toBe(false);
  });
});