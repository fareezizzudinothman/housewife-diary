import { AppError, ErrorCodes } from '../../shared/errors.js';

// In-memory fixed-window rate limiter, keyed per route bucket + client IP.
// Single-instance deployments only (this product runs one app container).
const buckets = new Map(); // key -> { count, resetAt }

const MAX_TRACKED_BUCKETS = 10000;

// Skip rate limiting in test environment
const isTestEnv = process.env.NODE_ENV === 'test';

function pruneExpiredBuckets(now) {
  if (buckets.size <= MAX_TRACKED_BUCKETS) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function createRateLimiter({ name, windowMs, max }) {
  return function rateLimit(req, _res, next) {
    // Skip rate limiting in test environment
    if (isTestEnv) {
      return next();
    }

    const now = Date.now();
    const key = `${name}:${req.ip ?? 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
      pruneExpiredBuckets(now);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      return next(
        new AppError('Too many requests. Please try again later.', {
          code: ErrorCodes.RATE_LIMITED,
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        }),
      );
    }
    return next();
  };
}

export function resetRateLimits() {
  buckets.clear();
}
