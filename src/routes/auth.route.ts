import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { loginLimiter, signupLimiter, emailActionLimiter } from '../middleware/rateLimit.js';
import {
  signupSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  completeAdminSetupSchema,
  verifyEmailSchema,
} from '../validations/auth.validation.js';

const router = Router();

// Public
router.post('/signup', signupLimiter,  validate(signupSchema), authController.signup); // role: user only — enforced in service
router.post('/login', loginLimiter, validate(loginSchema), authController.login); // shared by user/admin/super_admin
router.post('/google', loginLimiter,  validate(googleAuthSchema), authController.googleAuth);
router.post('/refresh', authController.refresh);
router.post('/forgot-password', emailActionLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password/:token', validate(resetPasswordSchema), authController.resetPassword);
router.get('/verify-email/:token', validate(verifyEmailSchema), authController.verifyEmail);
router.post(
  '/complete-admin-setup/:token',
  validate(completeAdminSetupSchema),
  authController.completeAdminSetup
);

// Authenticated
router.post('/logout', protect, authController.logout);
router.post('/resend-verification-email', protect, emailActionLimiter, authController.resendVerificationEmail);
router.get('/me', protect, authController.getMe);

export default router;