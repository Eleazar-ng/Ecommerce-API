import User from '../models/User.js';
import { UserDocument } from '../models/User.js';
import { AppError } from '../utils/appError.js';
import { hashPassword, comparePassword, generateSecureToken, hashToken } from '../utils/hash.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { verifyGoogleIdToken } from '../config/google.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.service.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PublicUser {
  id: unknown;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
  isEmailVerified: boolean;
  authProvider: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function publicUser(user: UserDocument): PublicUser {
  // Explicit allowlist, not a destructure-and-delete — new sensitive fields added to the
  // schema later default to EXCLUDED here unless someone deliberately adds them.
  return {
    id: user._id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    permissions: user.permissions,
    isEmailVerified: user.isEmailVerified,
    authProvider: user.authProvider,
  };
}

async function issueTokenPair(user: UserDocument): Promise<TokenPair> {
  const accessToken = signAccessToken(user._id.toString());
  const refreshToken = signRefreshToken(user._id.toString());
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();
  return { accessToken, refreshToken };
}

function assertLoginAllowed(user: UserDocument): void {
  if (user.isSuspended) {
    throw new AppError('This account has been suspended', 403);
  }
  if (user.accountStatus === 'pending') {
    throw new AppError('Account setup is not complete. Check your invite email.', 403);
  }
}

interface SignupParams {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

// --- Signup (role: user ONLY) ---
// `role` is never read from the request body here, by design — signup can only ever
// produce a plain 'user'. Admins are provisioned exclusively through inviteAdmin().
export async function signup({ email, username, password, firstName, lastName }: SignupParams) {
  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    const field = existing.email === email ? 'email' : 'username';
    throw new AppError(`This ${field} is already registered`, 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email,
    username,
    passwordHash,
    firstName,
    lastName,
    role: 'user',
  });

  const { raw } = generateSecureToken();
  user.emailVerificationTokenHash = hashToken(raw);
  user.emailVerificationExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
  await user.save();
  await sendVerificationEmail(user.email, raw);

  const tokens = await issueTokenPair(user);
  return { user: publicUser(user), ...tokens };
}

interface LoginParams {
  identifier: string;
  password: string;
}

// --- Login (shared by user, admin, super_admin) ---
export async function login({ identifier, password }: LoginParams) {
  const user = await User.findOne({
    $or: [{ email: identifier }, { username: identifier }],
  }).select('+passwordHash');

  if (!user || user.authProvider !== 'local' || !user.passwordHash) {
    // Same generic message whether the user doesn't exist or signed up via Google —
    // confirming "this email uses Google sign-in" to an unauthenticated caller is itself
    // a minor information leak.
    throw new AppError('Invalid credentials', 401);
  }

  assertLoginAllowed(user);

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  const tokens = await issueTokenPair(user);
  return { user: publicUser(user), ...tokens };
}

// --- Google sign-in / sign-up (also role: user ONLY) ---
export async function googleAuth(idToken: string) {
  const payload = await verifyGoogleIdToken(idToken);

  let user = await User.findOne({ googleId: payload.googleId });

  if (!user) {
    // Auto-link by email is deliberate: Google has already verified ownership of this email
    // address, so treating a matching local account as "the same person" is a reasonable,
    // commonly-used trust decision.
    const existingByEmail = await User.findOne({ email: payload.email });

    if (existingByEmail) {
      existingByEmail.googleId = payload.googleId;
      user = existingByEmail;
    } else {
      user = new User({
        email: payload.email,
        username: payload.email.split('@')[0] + '-' + payload.googleId.slice(0, 6),
        googleId: payload.googleId,
        authProvider: 'google',
        firstName: payload.firstName,
        lastName: payload.lastName,
        role: 'user',
        isEmailVerified: payload.emailVerified, // Google already verified it
        
      });
    }
    await user.save();
  }

  assertLoginAllowed(user);

  const tokens = await issueTokenPair(user);
  return { user: publicUser(user), ...tokens };
}

// --- Logout ---
export async function logout(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { $unset: { refreshTokenHash: 1 } });
}

// --- Refresh (rotation + reuse detection) ---
export async function refreshTokens(presentedRefreshToken: string) {
  let decoded;
  try {
    decoded = verifyRefreshToken(presentedRefreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await User.findById(decoded.sub).select('+refreshTokenHash');
  if (!user) {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const presentedHash = hashToken(presentedRefreshToken);

  if (!user.refreshTokenHash || user.refreshTokenHash !== presentedHash) {
    // The token is validly signed but doesn't match what's on file — it was already
    // rotated away by a previous refresh. This is the textbook signal of a stolen refresh
    // token being replayed. Nuke the session entirely rather than silently issuing new
    // tokens, forcing a fresh login.
    await User.findByIdAndUpdate(user._id, { $unset: { refreshTokenHash: 1 } });
    throw new AppError('Session invalidated. Please log in again.', 401);
  }

  assertLoginAllowed(user);

  const tokens = await issueTokenPair(user); // rotates refreshTokenHash to the new value
  return { user: publicUser(user), ...tokens };
}

// --- Forgot / reset password ---
export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, authProvider: 'local' });

  // No branching on whether `user` exists past this point — caller always returns the
  // same generic message either way. Prevents email enumeration.
  if (!user) return;

  const { raw, hash } = generateSecureToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();
  await sendPasswordResetEmail(user.email, raw);
}

export async function resetPassword(rawToken: string | any, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetTokenHash +passwordResetExpires');

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  // Force re-login on every device — a password reset likely means the old password was
  // compromised, so any session that started under it shouldn't be trusted to continue.
  user.refreshTokenHash = undefined;
  await user.save();
}

// --- Email verification ---
export async function verifyEmail(rawToken: string | any): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationTokenHash +emailVerificationExpires');

  if (!user) {
    throw new AppError('Invalid or expired verification link', 400);
  }

  user.isEmailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
}

// --- Admin completes account setup (sets their first password via invite link) ---
export async function completeAdminSetup(rawToken: string | any, password: string) {
  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    adminSetupTokenHash: tokenHash,
    adminSetupExpires: { $gt: new Date() },
  }).select('+adminSetupTokenHash +adminSetupExpires');

  if (!user) {
    throw new AppError('Invalid or expired invite link', 400);
  }

  user.passwordHash = await hashPassword(password);
  user.accountStatus = 'active';
  user.adminSetupTokenHash = undefined;
  user.adminSetupExpires = undefined;
  await user.save();

  const tokens = await issueTokenPair(user);
  return { user: publicUser(user), ...tokens };
}