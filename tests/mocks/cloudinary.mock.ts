import { vi } from 'vitest';

// Mirrors src/config/cloudinary.ts's export. api_sign_request is the only method the
// codebase actually calls (upload.service.ts) — the rest is here for shape-completeness.
export const mockCloudinary = {
  config: vi.fn(),
  utils: {
    api_sign_request: vi.fn().mockReturnValue('mock-signature'),
  },
};

// Usage: vi.mock('../../src/config/cloudinary.js', () => ({ cloudinary: mockCloudinary }));