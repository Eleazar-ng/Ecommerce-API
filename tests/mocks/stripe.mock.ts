import { vi } from 'vitest';

// Mirrors the shape of the real `stripe` export from src/config/stripe.ts, with every
// method this codebase actually calls stubbed as a vi.fn(). Individual tests override
// specific return values with .mockResolvedValueOnce()/.mockImplementation() as needed —
// this file just establishes the shape, so a test's `vi.mock('.../config/stripe.js', ...)`
// has something safe and consistent to return by default.
export const mockStripe = {
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
  },
  refunds: {
    create: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

// Usage in a test file (vi.mock calls are hoisted, so reference this via vi.hoisted()
// if you need to configure return values before the mocked module is first imported):
//
//   vi.mock('../../src/config/stripe.js', () => ({ stripe: mockStripe }));