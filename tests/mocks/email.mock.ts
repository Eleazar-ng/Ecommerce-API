import { vi } from 'vitest';

// No-op mocks for every function src/services/email.service.ts exports. Tests never need
// real email delivery — just, where relevant, confirmation that the right function was
// CALLED (e.g. `expect(sendVerificationEmail).toHaveBeenCalledOnce()`).
export const sendVerificationEmail = vi.fn();
export const sendPasswordResetEmail = vi.fn();
export const sendAdminInviteEmail = vi.fn();

// Usage: vi.mock('../../src/services/email.service.js', () => ({
//   sendVerificationEmail, sendPasswordResetEmail, sendAdminInviteEmail,
// }));