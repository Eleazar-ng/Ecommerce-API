import { rateLimit } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/appError.js';

// Routes a tripped limit through the normal error handler (Stage 4) instead of
// express-rate-limit's own default response body, so a 429 has the exact same
// { success, error: { code, message } } shape as every other error in this API.
function rateLimitHandler(req: Request, res: Response, next: NextFunction): void {
  next(new RateLimitError());
}

const commonOptions = {
  standardHeaders: true as const, // RateLimit-* response headers, so a well-behaved client can see its remaining quota
  legacyHeaders: false, // omit the deprecated X-RateLimit-* headers
  handler: rateLimitHandler,
};

// Brute-force protection on login. Deliberately IP-based, not per-account — locking an
// ACCOUNT after N failed attempts is itself an abuse vector (an attacker can lock a victim
// out of their own account just by repeatedly failing login with a wrong password). A
// shared-IP false positive (e.g. office NAT) is the lesser harm here.
export const loginLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 5,
});

// Spam-account prevention.
export const signupLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  max: 10,
});

// Covers BOTH forgot-password and resend-verification-email — same abuse vector (using
// this API to spam someone else's inbox with unwanted emails), so the same limit applies
// to both. This is the gap explicitly flagged in docs/deferred-decisions.md after the
// resend-verification endpoint was added mid-Stage-6.
export const emailActionLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
});

// Checkout makes real Stripe API calls (PaymentIntent create/cancel/retrieve). Capped
// independently of the general limiter so one user's retry storm can't burn through Stripe
// API quota or flood the account with abandoned PaymentIntents.
export const checkoutLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
});

// Baseline, applied globally in app.ts as defense-in-depth. Generous enough that normal
// browsing/API use never comes close — this exists to stop a naive flood against any
// endpoint that doesn't have its own specific, stricter limiter above.
export const globalLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  max: 300,
});