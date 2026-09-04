import type { Request, Response, NextFunction } from 'express';
import { User } from '../models/index.js';
import type { UserRole } from '../models/index.js';
import { UnauthorizedError, ForbiddenError } from '../utils/appError.js';
import { verifyAccessToken } from '../utils/token.js';

// Verifies the JWT AND re-checks isSuspended against the DB on every request — not just at
// login. A JWT issued before someone was suspended is still cryptographically valid until
// it expires; without this DB check here, a suspended user stays fully functional for the
// remaining lifetime of their access token (up to JWT_ACCESS_EXPIRES_IN).
export async function protect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Not authenticated');
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }
    if (user.isSuspended) {
      throw new ForbiddenError('This account has been suspended');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// optionalAuth: for routes that are public but behave differently for an authenticated
// admin (e.g. product listing exposing includeInactive). Attaches req.user if a valid,
// non-suspended token is present; silently proceeds as anonymous otherwise. NEVER rejects
// the request — an invalid/expired/missing token on an optional-auth route is not an error,
// it just means the caller is treated as anonymous.
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }
 
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.sub);
    if (user && !user.isSuspended) {
      req.user = user;
    }
  } catch {
    // Invalid or expired token on an optional route — proceed anonymously rather than
    // rejecting. Only `protect` treats this as an error.
  }
  next();
}

// restrictTo('admin', 'super_admin') — role-level gate, checked after protect()
export function restrictTo(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }
    next();
  };
}

// requirePermission('manage_products') — fine-grained gate for admins specifically.
// super_admin bypasses this entirely; a plain 'user' always fails it (this middleware
// assumes restrictTo('admin', 'super_admin') already ran).
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user.role === 'super_admin') {
      return next();
    }
    if (req.user.role === 'admin' && req.user.permissions.includes(permission)) {
      return next();
    }
    return next(new ForbiddenError(`Missing required permission: ${permission}`));
  };
}