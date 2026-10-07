import { AppError, ErrorCodes } from '../../shared/errors.js';
import { hasAtLeast } from '../../shared/roles.js';
import { SESSION_COOKIE } from '../utils/cookies.js';
import { resolveSession } from '../services/sessionService.js';
import { findByHouseholdAndUser } from '../repositories/householdMemberRepository.js';

// Validates the session cookie, loads the user onto req.user and the session
// onto req.session (with sliding renewal). Unauthenticated → 401.
export async function requireAuth(req, _res, next) {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE];
    if (!rawToken) {
      throw new AppError('You must be signed in.', {
        code: ErrorCodes.UNAUTHORIZED,
        status: 401,
      });
    }
    const session = await resolveSession(rawToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!session) {
      throw new AppError('Your session has expired. Please sign in again.', {
        code: ErrorCodes.UNAUTHORIZED,
        status: 401,
      });
    }
    req.user = session.user;
    req.session = session;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Resolves the user's ACTIVE household membership onto req.householdId and
// req.householdRole. Used by module routers; household-scoped data is always
// filtered by req.householdId, never by a client-supplied id.
// minRole (optional): require at least this household role (403 otherwise).
export function requireHousehold(minRole) {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new AppError('You must be signed in.', {
          code: ErrorCodes.UNAUTHORIZED,
          status: 401,
        });
      }
      const activeHouseholdId = req.user.activeHouseholdId;
      if (!activeHouseholdId) {
        throw new AppError('No active household selected.', {
          code: ErrorCodes.FORBIDDEN,
          status: 403,
        });
      }
      const membership = await findByHouseholdAndUser(activeHouseholdId, req.user.id);
      if (!membership) {
        throw new AppError('Your active household is no longer available.', {
          code: ErrorCodes.FORBIDDEN,
          status: 403,
        });
      }
      if (minRole && !hasAtLeast(membership.role, minRole)) {
        throw new AppError(
          `This action requires the ${minRole} role or higher in the active household.`,
          { code: ErrorCodes.FORBIDDEN, status: 403 },
        );
      }
      req.householdId = activeHouseholdId;
      req.householdRole = membership.role;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
