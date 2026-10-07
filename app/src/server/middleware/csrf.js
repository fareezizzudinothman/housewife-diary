import { AppError, ErrorCodes } from '../../shared/errors.js';
import { CSRF_COOKIE } from '../utils/cookies.js';
import { timingSafeEqualStrings } from '../utils/tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit CSRF protection for same-origin cookie sessions: unsafe
// methods must echo the hd_csrf cookie value in the X-CSRF-Token header.
// Combined with SameSite=Lax cookies this blocks cross-site state changes.
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || !timingSafeEqualStrings(cookieToken, headerToken)) {
    return next(
      new AppError('CSRF validation failed. Refresh the page and try again.', {
        code: ErrorCodes.FORBIDDEN,
        status: 403,
      }),
    );
  }
  return next();
}
