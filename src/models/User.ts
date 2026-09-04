import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export type UserRole = 'user' | 'admin' | 'super_admin';
export type AuthProvider = 'local' | 'google';
export type AccountStatus = 'pending' | 'active';

export interface IUser {
  email: string;
  passwordHash?: string;
  authProvider: AuthProvider;
  googleId?: string;
  role: UserRole;
  permissions: string[];
  username: string;
  firstName: string;
  lastName: string;
  isSuspended: boolean;
  isEmailVerified: boolean;
  accountStatus: AccountStatus;
  refreshTokenHash?: string | undefined;
  passwordResetTokenHash?: string | undefined;
  passwordResetExpires?: Date | undefined;
  adminSetupTokenHash?: string | undefined;
  adminSetupExpires?: Date | undefined;
  emailVerificationTokenHash?: string | undefined;
  emailVerificationExpires?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true, // creates a unique index — login lookups and duplicate-signup checks both depend on this
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      select: false, // never returned by default — must opt in with .select('+passwordHash')
      // NOT globally `required` — Google-authenticated users never set a password, and
      // admin accounts start in accountStatus 'pending' with no password until they
      // complete setup via their invite link. Presence is enforced in the service layer
      // for the local-signup and complete-admin-setup flows instead.
    },
    authProvider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true, // sparse so multiple local-auth users (with no googleId at all) don't collide on `null`
      select: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'super_admin'],
      default: 'user',
    },
    // Only meaningful when role === 'admin'. super_admin bypasses permission checks
    // entirely (see requirePermission middleware) rather than needing every permission
    // listed here explicitly — otherwise every new permission added to the app would
    // require a migration to backfill the super_admin's permissions array.
    permissions: {
      type: [String],
      default: [],
    },
    username: {
      type: String,
      required: true,
      unique: true, // second unique index on this collection, alongside email
      trim: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    // Soft-ban flag. Checked in the auth middleware on every authenticated request (not just
    // at login) — a JWT issued before suspension is still technically valid until it expires,
    // so login-time-only checks would let an already-logged-in suspended user keep acting.
    isSuspended: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    // 'pending' = admin was created by super_admin but hasn't set a password yet via their
    // invite link — login must be blocked until this flips to 'active'.
    accountStatus: {
      type: String,
      enum: ['pending', 'active'],
      default: 'active',
    },
    // Stores the hash of the CURRENT valid refresh token, not the token itself. Rotated on
    // every refresh. A presented token that doesn't match this hash is either expired-and-
    // rotated-away or stolen — see auth.service.ts refreshTokens().
    refreshTokenHash: {
      type: String,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    // Separate from passwordResetToken even though the mechanism is identical — keeping
    // them distinct means expiry windows can differ, and one flow can't be replayed as the other.
    adminSetupTokenHash: {
      type: String,
      select: false,
    },
    adminSetupExpires: {
      type: Date,
      select: false,
    },
    // Store a HASH of the verification token, never the raw token — same principle as
    // passwordHash. Hashed with SHA-256, not bcrypt: this token is single-use and
    // short-lived, so bcrypt's deliberate slowness buys nothing here.
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', userSchema);