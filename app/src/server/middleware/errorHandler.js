import { Prisma } from '@prisma/client';
import { AppError, ErrorCodes } from '../../shared/errors.js';
import { sendError } from '../utils/http.js';

const pageNotFoundHtml =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Page not found</title></head>' +
  '<body><h1>Page not found</h1><p><a href="/">Return to Housewife Diary</a></p></body></html>';

export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api')) {
    return sendError(res, {
      code: ErrorCodes.NOT_FOUND,
      message: `No route matches ${req.method} ${req.path}.`,
      status: 404,
    });
  }
  return res.status(404).type('html').send(pageNotFoundHtml);
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    if (err.cause) {
      console.error(err.cause);
    }
    for (const [name, value] of Object.entries(err.headers ?? {})) {
      res.setHeader(name, value);
    }
    return sendError(res, { code: err.code, message: err.message, details: err.details, status: err.status });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return sendError(res, {
      code: ErrorCodes.DATABASE_ERROR,
      message: 'The database is currently unreachable.',
      status: 503,
    });
  }

  if (err.type === 'entity.parse.failed') {
    return sendError(res, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'The request body is not valid JSON.',
      status: 400,
    });
  }

  if (err.type === 'entity.too.large') {
    return sendError(res, {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'The request body is too large.',
      status: 413,
    });
  }

  console.error(err);
  const isProduction = process.env.NODE_ENV === 'production';
  return sendError(res, {
    code: ErrorCodes.INTERNAL_ERROR,
    message: isProduction ? 'An unexpected error occurred.' : err.message,
    status: 500,
  });
}
