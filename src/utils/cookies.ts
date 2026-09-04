import type { Response, CookieOptions } from 'express';
import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

const cookieOptions: CookieOptions = {
  httpOnly: true, // inaccessible to JS — mitigates XSS token theft
  secure: env.NODE_ENV === 'production', // HTTPS only in production; allow http for local dev
  sameSite: 'strict', // not sent on cross-site requests — mitigates CSRF
  path: '/api/v1/auth', // only sent to auth routes, not the whole API surface
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, cookieOptions);
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
}