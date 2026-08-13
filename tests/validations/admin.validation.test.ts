import { describe, it, expect } from 'vitest';
import { inviteAdminSchema } from '../../src/validations/admin.validation.js';

describe('inviteAdminSchema', () => {
  const validBody = {
    email: 'newadmin@example.com',
    username: 'newadmin',
    firstName: 'New',
    lastName: 'Admin',
  };

  it('defaults permissions to an empty array when omitted', () => {
    const result = inviteAdminSchema.safeParse({ body: validBody });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body.permissions).toEqual([]);
    }
  });

  it('accepts a valid known permission', () => {
    const result = inviteAdminSchema.safeParse({
      body: { ...validBody, permissions: ['manage_products'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple valid permissions at once', () => {
    const result = inviteAdminSchema.safeParse({
      body: { ...validBody, permissions: ['manage_products', 'manage_inventory', 'view_transactions'] },
    });
    expect(result.success).toBe(true);
  });

  // AVAILABLE_PERMISSIONS is defined as a fixed, closed set specifically so a super_admin
  // can't accidentally grant a permission string that no requirePermission() check in the
  // codebase actually recognizes — a typo'd or made-up permission would otherwise silently
  // grant nothing while looking like it grants something. This test is the regression guard
  // for that closed-set property.
  it('rejects an unrecognized permission string', () => {
    const result = inviteAdminSchema.safeParse({
      body: { ...validBody, permissions: ['delete_everything'] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid username format', () => {
    const result = inviteAdminSchema.safeParse({
      body: { ...validBody, username: 'bad username!' },
    });
    expect(result.success).toBe(false);
  });
});