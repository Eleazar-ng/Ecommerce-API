import { beforeAll, afterAll, afterEach, inject } from 'vitest';
import mongoose from 'mongoose';

// These MUST be set before anything imports config/env.ts, since its Zod validation runs
// immediately at module load time. This works because Vitest fully evaluates setupFiles
// as a separate step BEFORE it loads the actual test file's module graph — so a test file's
// own `import app from '../src/app.js'` only resolves after these assignments have already
// run. dotenv.config() inside env.ts does NOT override already-set process.env values, so
// even if a real .env exists in the project root, these test values win.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = inject('mongoUri');
process.env.JWT_ACCESS_SECRET = 'test-access-secret-not-for-real-use';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-not-for-real-use';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
// Stripe/Cloudinary/Google values below are never actually sent anywhere real — every test
// that touches those integrations mocks the relevant module (see tests/mocks/). These exist
// purely to satisfy env.ts's required-field validation so the app can boot in a test process.
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy_for_tests';
process.env.CLOUDINARY_CLOUD_NAME = 'dummy';
process.env.CLOUDINARY_API_KEY = 'dummy';
process.env.CLOUDINARY_API_SECRET = 'dummy';
process.env.GOOGLE_CLIENT_ID = 'dummy.apps.googleusercontent.com';
process.env.CLIENT_URL = 'http://localhost:3000';

// Dynamic imports here (not static top-of-file imports) are deliberate: they defer
// evaluating config/db.ts — and transitively config/env.ts — until AFTER the process.env
// assignments above have already run synchronously.
beforeAll(async () => {
  const { connectDB } = await import('../src/config/db.js');
  await connectDB();
});

// Wipes every collection between tests so each test starts from a clean slate, without
// paying the cost of tearing down and restarting the in-memory replica set itself (that
// only happens once, in global-setup.ts, for the whole test run).
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  const { disconnectDB } = await import('../src/config/db.js');
  await disconnectDB();
});