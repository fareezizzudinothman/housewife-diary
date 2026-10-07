import crypto from 'node:crypto';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import { sendSuccess } from '../utils/http.js';
import { config } from '../config/config.js';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearSessionCookie,
  setCsrfCookie,
  setSessionCookie,
} from '../utils/cookies.js';
import * as authService from '../services/authService.js';
import * as sessionService from '../services/sessionService.js';
import * as userRepository from '../repositories/userRepository.js';
import * as sessionRepository from '../repositories/sessionRepository.js';
import * as householdMemberRepository from '../repositories/householdMemberRepository.js';

const secureCookies = config.env === 'production';

function respondWithSession(res, { user, session, token }, status = 200) {
  setSessionCookie(res, token, {
    maxAge: sessionService.sessionCookieMaxAgeMs(session),
    secure: secureCookies,
  });
  return sendSuccess(res, { user: userRepository.toPublicUser(user) }, status);
}

async function householdViews(user) {
  const memberships = await householdMemberRepository.listByUser(user.id);
  const counts = await householdMemberRepository.countByHouseholdIds(
    memberships.map((membership) => membership.householdId),
  );
  const memberCounts = new Map(counts.map((row) => [row.householdId, row._count.userId]));
  return memberships.map((membership) => ({
    householdId: membership.householdId,
    name: membership.household.name,
    role: membership.role,
    memberCount: memberCounts.get(membership.householdId) ?? 0,
    isActive: membership.householdId === user.activeHouseholdId,
  }));
}

// GET /api/auth/csrf — issues the double-submit CSRF cookie + token.
export function issueCsrf(req, res) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || token.length < 20) {
    token = crypto.randomBytes(24).toString('base64url');
    setCsrfCookie(res, token, { secure: secureCookies });
  }
  return sendSuccess(res, { token });
}

export async function register(req, res, next) {
  try {
    const { user, session, token } = await authService.register(req.validated, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return respondWithSession(res, { user, session, token }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { user, session, token } = await authService.login(req.validated, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return respondWithSession(res, { user, session, token });
  } catch (error) {
    return next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE];
    if (rawToken) {
      await authService.logout(rawToken, { userId: req.user?.id, ip: req.ip });
    }
    clearSessionCookie(res, secureCookies);
    return sendSuccess(res, { loggedOut: true });
  } catch (error) {
    return next(error);
  }
}

export async function getSession(req, res, next) {
  try {
    return sendSuccess(res, {
      user: userRepository.toPublicUser(req.user),
      session: sessionService.toSessionView(req.session, { current: true }),
      households: await householdViews(req.user),
    });
  } catch (error) {
    return next(error);
  }
}

export async function changePassword(req, res, next) {
  try {
    await authService.changePassword({ user: req.user, session: req.session, ...req.validated });
    return sendSuccess(res, { message: 'Password updated. Other sessions were signed out.' });
  } catch (error) {
    return next(error);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    await authService.forgotPassword(req.validated, { ip: req.ip });
    // Uniform response regardless of account existence.
    return sendSuccess(res, {
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  } catch (error) {
    return next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.validated, { ip: req.ip });
    return sendSuccess(res, { message: 'Password updated. Please sign in with your new password.' });
  } catch (error) {
    return next(error);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    await authService.verifyEmail(req.validated.token);
    return sendSuccess(res, { message: 'Email verified. Thank you!' });
  } catch (error) {
    return next(error);
  }
}

export async function resendVerification(req, res, next) {
  try {
    await authService.resendVerification(req.user);
    return sendSuccess(res, { message: 'Verification email sent.' });
  } catch (error) {
    return next(error);
  }
}

export async function listSessions(req, res, next) {
  try {
    const sessions = await sessionRepository.listByUser(req.user.id);
    return sendSuccess(res, {
      sessions: sessions.map((session) =>
        sessionService.toSessionView(session, { current: session.id === req.session.id }),
      ),
    });
  } catch (error) {
    return next(error);
  }
}

export async function revokeSession(req, res, next) {
  try {
    const session = await sessionRepository.findByIdAndUser(req.params.id, req.user.id);
    if (!session) {
      throw new AppError('Session not found.', { code: ErrorCodes.NOT_FOUND, status: 404 });
    }
    await sessionRepository.deleteById(session.id);
    return sendSuccess(res, { revoked: session.id });
  } catch (error) {
    return next(error);
  }
}

export async function revokeOtherSessions(req, res, next) {
  try {
    const count = await sessionService.revokeOtherSessions(req.user.id, req.session.id);
    return sendSuccess(res, { revokedCount: count });
  } catch (error) {
    return next(error);
  }
}
