import { ErrorCodes } from '../../shared/errors.js';

export function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function sendError(
  res,
  { code = ErrorCodes.INTERNAL_ERROR, message = 'An unexpected error occurred.', details = [], status = 500 } = {},
) {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
  });
}
