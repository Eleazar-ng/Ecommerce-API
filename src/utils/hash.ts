import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function comparePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

export interface SecureToken {
  raw: string;
  hash: string;
}

// Used for every "raw token emailed to user, hash stored in DB" flow: email verification,
// password reset, admin setup invites. Caller sends `raw` to the user and persists `hash`
// in the DB, never the other way around.
export function generateSecureToken(): SecureToken {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}