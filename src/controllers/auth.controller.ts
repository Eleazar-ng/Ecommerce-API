import * as authService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from '../utils/cookies.js';
import { AppError } from '../utils/appError.js';

export const signup = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.signup(req.body);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ success: true, data: { user, accessToken } });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ success: true, data: { user, accessToken } });
});

export const googleAuth = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.googleAuth(req.body.idToken);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ success: true, data: { user, accessToken } });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user._id.toString());
  clearRefreshCookie(res);
  res.status(200).json({ success: true, message: 'Logged out' });
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!presented) {
    throw new AppError('No refresh token provided', 401);
  }

  const { user, accessToken, refreshToken } = await authService.refreshTokens(presented);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ success: true, data: { user, accessToken } });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  res.status(200).json({
    success: true,
    message: 'If that email is registered, a reset link has been sent.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.params.token, req.body.password);
  res.status(200).json({ success: true, message: 'Password reset successfully. Please log in.' });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail(req.params.token);
  res.status(200).json({ success: true, message: 'Email verified' });
});

export const completeAdminSetup = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.completeAdminSetup(
    req.params.token,
    req.body.password
  );
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ success: true, data: { user, accessToken } });
});

export const resendVerificationEmail = asyncHandler(async (req, res) => {
  await authService.resendVerificationEmail(req.user);
  res.status(200).json({ success: true, message: 'Verification email sent' });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      id: req.user._id,
      email: req.user.email,
      username: req.user.username,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      permissions: req.user.permissions,
      isEmailVerified: req.user.isEmailVerified,
    },
  });
});