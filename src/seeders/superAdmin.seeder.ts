// The super_admin is never created through any HTTP endpoint — there's no route that could
// produce role: 'super_admin', by design. This script is the ONLY path to a super_admin
// existing, and it's meant to be run once, manually, outside the request/response cycle.
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/index.js';
import { hashPassword } from '../utils/hash.js';

async function seedSuperAdmin(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const username = process.env.SUPER_ADMIN_USERNAME;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
  const lastName = process.env.SUPER_ADMIN_LAST_NAME || 'Admin';

  if (!email || !username || !password) {
    console.error(
      'Missing SUPER_ADMIN_EMAIL, SUPER_ADMIN_USERNAME, or SUPER_ADMIN_PASSWORD in .env'
    );
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ role: 'super_admin' });
  if (existing) {
    console.log(`A super_admin already exists (${existing.email}). Skipping — this script is idempotent.`);
    await disconnectDB();
    process.exit(0);
  }

  const passwordHash = await hashPassword(password);
  const superAdmin = await User.create({
    email,
    username,
    passwordHash,
    firstName,
    lastName,
    role: 'super_admin',
    accountStatus: 'active',
    isEmailVerified: true,
  });

  console.log(`super_admin created: ${superAdmin.email}`);
  await disconnectDB();
  process.exit(0);
}

seedSuperAdmin().catch((err) => {
  console.error('Seeder failed:', err);
  process.exit(1);
});