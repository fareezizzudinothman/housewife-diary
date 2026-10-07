import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import * as authController from '../controllers/authController.js';
import {
  validateChangePassword,
  validateForgotPassword,
  validateLogin,
  validateRegister,
  validateResetPassword,
  validateVerifyEmailQuery,
} from '../validators/authValidators.js';

const router = Router();

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const registerLimiter = createRateLimiter({ name: 'register', windowMs: FIFTEEN_MINUTES_MS, max: 20 });
const loginLimiter = createRateLimiter({ name: 'login', windowMs: FIFTEEN_MINUTES_MS, max: 30 });
const forgotPasswordLimiter = createRateLimiter({
  name: 'forgot-password',
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
});
const resetPasswordLimiter = createRateLimiter({
  name: 'reset-password',
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
});
const verifyEmailLimiter = createRateLimiter({
  name: 'verify-email',
  windowMs: FIFTEEN_MINUTES_MS,
  max: 20,
});
const changePasswordLimiter = createRateLimiter({
  name: 'change-password',
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
});
const resendVerificationLimiter = createRateLimiter({
  name: 'resend-verification',
  windowMs: FIFTEEN_MINUTES_MS,
  max: 10,
});

// Public routes.
router.get('/csrf', authController.issueCsrf);
router.post(
  '/register',
  validate(validateRegister),
  registerLimiter,
  authController.register,
);
router.post('/login', validate(validateLogin), loginLimiter, authController.login);
router.post(
  '/forgot-password',
  validate(validateForgotPassword),
  forgotPasswordLimiter,
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  validate(validateResetPassword),
  resetPasswordLimiter,
  authController.resetPassword,
);
router.get(
  '/verify-email',
  validate(validateVerifyEmailQuery, 'query'),
  verifyEmailLimiter,
  authController.verifyEmail,
);

// Authenticated routes.
router.use(requireAuth);
router.post('/logout', authController.logout);
router.get('/session', authController.getSession);
router.post(
  '/change-password',
  validate(validateChangePassword),
  changePasswordLimiter,
  authController.changePassword,
);
router.post('/verify-email/resend', resendVerificationLimiter, authController.resendVerification);
router.get('/sessions', authController.listSessions);
router.delete('/sessions/other', authController.revokeOtherSessions);
router.delete('/sessions/:id', authController.revokeSession);

export default router;
