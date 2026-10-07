import { Prisma } from '@prisma/client';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import * as userRepository from '../repositories/userRepository.js';
import * as authTokenRepository from '../repositories/authTokenRepository.js';
import * as sessionService from './sessionService.js';
import { sendMail } from './mailService.js';
import { hashPassword, verifyPassword, dummyPasswordHash } from '../utils/passwords.js';
import {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  PASSWORD_RESET_TOKEN_TTL_MS,
  generateToken,
  hashToken,
} from '../utils/tokens.js';
import { logAuthEvent } from '../utils/audit.js';

const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const RESEND_VERIFICATION_MAX = 3;
const RESEND_VERIFICATION_WINDOW_MS = 60 * 60 * 1000;

// In-memory per-account login throttling (single-instance deployment).
const failedLogins = new Map(); // email -> { count, lockedUntil }
const verificationResends = new Map(); // userId -> { count, resetAt }

function checkLoginLockout(email) {
  const entry = failedLogins.get(email);
  if (entry && entry.lockedUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    throw new AppError('Too many failed sign-in attempts. Please try again later.', {
      code: ErrorCodes.RATE_LIMITED,
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
  }
}

function recordLoginFailure(email) {
  const entry = failedLogins.get(email) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_FAILURES) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
    logAuthEvent('login_lockout', { email });
  }
  failedLogins.set(email, entry);
}

function clearLoginFailures(email) {
  failedLogins.delete(email);
}

function checkVerificationResendThrottle(userId) {
  const now = Date.now();
  const entry = verificationResends.get(userId);
  if (entry && entry.resetAt <= now) {
    verificationResends.delete(userId);
    return;
  }
  if (entry && entry.count >= RESEND_VERIFICATION_MAX) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    throw new AppError('Too many verification emails requested. Please try again later.', {
      code: ErrorCodes.RATE_LIMITED,
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
  }
}

function recordVerificationResend(userId) {
  const now = Date.now();
  const entry = verificationResends.get(userId) ?? { count: 0, resetAt: now + RESEND_VERIFICATION_WINDOW_MS };
  entry.count += 1;
  verificationResends.set(userId, entry);
}

async function issueEmailVerification(user) {
  // A fresh request replaces any previous pending token (single active token).
  await authTokenRepository.deleteEmailVerificationTokensForUser(user.id);
  const { token } = generateToken();
  await authTokenRepository.createEmailVerificationToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
  });
  sendMail({
    to: user.email,
    subject: 'Verify your Housewife Diary email',
    text: `Welcome to Housewife Diary, ${user.name}!\n\nConfirm your email address by opening:\n/api/auth/verify-email?token=${token}\n\nThis link expires in 24 hours.`,
  });
}

export async function register({ name, email, password, timezone }, { ip = null, userAgent = null } = {}) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError('An account with this email already exists.', {
      code: ErrorCodes.CONFLICT,
      status: 409,
    });
  }
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await userRepository.create({ email, passwordHash, name, timezone });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('An account with this email already exists.', {
        code: ErrorCodes.CONFLICT,
        status: 409,
      });
    }
    throw error;
  }
  logAuthEvent('register', { userId: user.id, email: user.email, ip });
  await issueEmailVerification(user);
  // Auto-login with a short (non-remember-me) session.
  const { session, token } = await sessionService.createSession(user, { rememberMe: false, ip, userAgent });
  return { user, session, token };
}

export async function login({ email, password, rememberMe }, { ip = null, userAgent = null } = {}) {
  checkLoginLockout(email);
  const user = await userRepository.findByEmail(email);
  // Always run a bcrypt comparison so unknown email and wrong password are
  // indistinguishable in both message and timing.
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash());
  if (!user || !passwordOk) {
    recordLoginFailure(email);
    logAuthEvent('login_failure', { email, ip });
    throw new AppError('Invalid email or password.', {
      code: ErrorCodes.UNAUTHORIZED,
      status: 401,
    });
  }
  clearLoginFailures(email);
  const { session, token } = await sessionService.createSession(user, { rememberMe, ip, userAgent });
  logAuthEvent('login_success', { userId: user.id, email: user.email, ip });
  return { user, session, token };
}

export async function logout(rawToken, { userId = null, ip = null } = {}) {
  const revoked = await sessionService.revokeSessionByToken(rawToken);
  logAuthEvent('logout', { userId, ip, revoked });
}

export async function changePassword({ user, session, currentPassword, newPassword }) {
  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    recordLoginFailure(user.email);
    logAuthEvent('password_change_failure', { userId: user.id });
    throw new AppError('Your current password is incorrect.', {
      code: ErrorCodes.UNAUTHORIZED,
      status: 401,
    });
  }
  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePassword(user.id, passwordHash);
  // Revoke every OTHER session; the current one stays signed in.
  await sessionService.revokeOtherSessions(user.id, session.id);
  logAuthEvent('password_change', { userId: user.id });
}

export async function forgotPassword({ email }, { ip = null } = {}) {
  const user = await userRepository.findByEmail(email);
  // Uniform response whether or not the account exists (no enumeration).
  if (!user) {
    return;
  }
  // A new request invalidates any previous pending reset token.
  await authTokenRepository.deletePasswordResetTokensForUser(user.id);
  const { token } = generateToken();
  await authTokenRepository.createPasswordResetToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  });
  sendMail({
    to: user.email,
    subject: 'Reset your Housewife Diary password',
    text: `A password reset was requested for your account.\n\nOpen the link below to choose a new password (valid for 1 hour, single use):\n/pages/reset-password.html?token=${token}\n\nIf you did not request this, you can ignore this email.`,
  });
  logAuthEvent('password_reset_requested', { userId: user.id, ip });
}

export async function resetPassword({ token, password }, { ip = null } = {}) {
  const tokenHash = hashToken(token);
  const record = await authTokenRepository.findValidPasswordResetToken(tokenHash);
  if (!record) {
    throw new AppError('This reset link is invalid or has expired.', {
      code: ErrorCodes.UNAUTHORIZED,
      status: 401,
    });
  }
  const consumed = await authTokenRepository.consumePasswordResetToken(record.id);
  if (!consumed) {
    throw new AppError('This reset link is invalid or has expired.', {
      code: ErrorCodes.UNAUTHORIZED,
      status: 401,
    });
  }
  const passwordHash = await hashPassword(password);
  await userRepository.updatePassword(record.userId, passwordHash);
  // A password reset revokes ALL sessions for the account.
  await sessionService.revokeAllSessionsForUser(record.userId);
  sendMail({
    to: record.user.email,
    subject: 'Your Housewife Diary password was changed',
    text: 'Your password was just changed and all sessions were signed out. If this was not you, reset your password immediately.',
  });
  logAuthEvent('password_reset', { userId: record.userId, ip });
}

export async function verifyEmail(token) {
  const tokenHash = hashToken(token);
  const record = await authTokenRepository.findValidEmailVerificationToken(tokenHash);
  if (!record) {
    throw new AppError('This verification link is invalid or has expired.', {
      code: ErrorCodes.UNAUTHORIZED,
      status: 401,
    });
  }
  const consumed = await authTokenRepository.consumeEmailVerificationToken(record.id);
  if (!consumed) {
    throw new AppError('This verification link is invalid or has expired.', {
      code: ErrorCodes.UNAUTHORIZED,
      status: 401,
    });
  }
  if (!record.user.emailVerifiedAt) {
    await userRepository.markEmailVerified(record.userId);
  }
  logAuthEvent('email_verified', { userId: record.userId });
}

export async function resendVerification(user) {
  if (user.emailVerifiedAt) {
    throw new AppError('Your email address is already verified.', {
      code: ErrorCodes.CONFLICT,
      status: 409,
    });
  }
  checkVerificationResendThrottle(user.id);
  const fresh = await userRepository.findById(user.id);
  await issueEmailVerification(fresh);
  recordVerificationResend(user.id);
  logAuthEvent('verification_resent', { userId: user.id });
}

// Test-only helper: clears in-memory throttle state between test files.
export function resetAuthThrottles() {
  failedLogins.clear();
  verificationResends.clear();
}
