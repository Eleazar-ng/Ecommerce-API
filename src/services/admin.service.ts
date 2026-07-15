import User from '../models/User.js';
import { AppError } from '../utils/appError.js';
import { generateSecureToken } from '../utils/hash.js';
import { sendAdminInviteEmail } from './email.service.js';

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — longer than a password reset,
// since an invite might sit unread for a few days before the new admin gets to it.

// `as const` makes this a readonly tuple of string literals, not just string[] — that's
// what lets validations/admin.validation.ts pass it straight into z.enum() and get real
// literal-union typing, instead of a bare `string`.
export const AVAILABLE_PERMISSIONS = [
  'manage_products',
  'manage_categories',
  'manage_orders',
  'manage_inventory',
  'view_transactions',
] as const;

export type Permission = (typeof AVAILABLE_PERMISSIONS)[number];

interface InviteAdminParams {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  permissions?: Permission[];
}

export async function inviteAdmin({
  email,
  username,
  firstName,
  lastName,
  permissions = [],
}: InviteAdminParams) {
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    const field = existing.email === email ? 'email' : 'username';
    throw new AppError(`This ${field} is already registered`, 409);
  }

  const user = new User({
    email,
    username,
    firstName,
    lastName,
    role: 'admin',
    permissions,
    accountStatus: 'pending', // stays this way — and unable to log in — until setup is completed
    isEmailVerified: true, // invited directly by super_admin; no self-serve verification needed
  });

  const { raw, hash } = generateSecureToken();
  user.adminSetupTokenHash = hash;
  user.adminSetupExpires = new Date(Date.now() + INVITE_TOKEN_TTL_MS);
  await user.save();

  await sendAdminInviteEmail(user.email, raw);

  return {
    id: user._id,
    email: user.email,
    username: user.username,
    role: user.role,
    accountStatus: user.accountStatus,
  };
}

export async function updateAdminPermissions(adminId: string | any, permissions: Permission[]) {
  const admin = await User.findOne({ _id: adminId, role: 'admin' });
  if (!admin) {
    throw new AppError('Admin not found', 404);
  }

  admin.permissions = permissions;
  await admin.save();

  return { id: admin._id, permissions: admin.permissions };
}

export async function listAdmins() {
  return User.find({ role: 'admin' }).select(
    'email username firstName lastName permissions accountStatus isSuspended createdAt'
  );
}