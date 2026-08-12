import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    // MongoMemoryReplSet startup + real transactions can be slow, especially in CI —
    // generous timeouts avoid flaky failures that are really just "still starting up."
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});