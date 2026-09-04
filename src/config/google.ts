import { OAuth2Client } from 'google-auth-library';
import { env } from './env.js';

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

// Verifies the ID token's signature, audience, and expiry against Google's public keys.
// Throws if invalid — caller (auth.service.ts) should let that propagate into a 401.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload || !payload.email) {
    throw new Error('Invalid Google token payload');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    firstName: payload.given_name ?? '',
    lastName: payload.family_name ?? '',
  };
}