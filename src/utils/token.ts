import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';

export interface TokenPayload {
  sub: string;
  jti: string;
}

// jti (JWT ID) — a random unique value per issued token. Without this, a token's content is
// just { sub, iat, exp }, and `iat` only has SECOND-level granularity: two tokens signed for
// the same user within the same wall-clock second are byte-for-byte IDENTICAL. That silently
// breaks refresh-token rotation's core assumption (a rotated-away token must always be
// distinguishable from the current one) whenever two refreshes — legitimate or not — happen
// within the same second. jti makes every issued token unique regardless of timing, which is
// what refreshTokens()'s reuse-detection in auth.service.ts actually depends on to work
// correctly. Standard JWT practice, not specific to this bug — also a prerequisite if this
// app ever wants per-token revocation/blacklisting later.
// Access and refresh tokens use DIFFERENT secrets. If they shared one, a leaked refresh
// token secret would also compromise access tokens, and vice versa.
function generateJti(): string {
  return crypto.randomUUID();
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, jti: generateJti() }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, jti: generateJti() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string | any): TokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}