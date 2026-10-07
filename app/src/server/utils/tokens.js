import crypto from 'node:crypto';
import { config } from '../config/config.js';

export const SESSION_TTL_SHORT_MS = 24 * 60 * 60 * 1000; // 1 day
export const SESSION_TTL_REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_CAP_SHORT_MS = 3 * SESSION_TTL_SHORT_MS; // sliding renewal cap
export const SESSION_CAP_REMEMBER_MS = 3 * SESSION_TTL_REMEMBER_MS;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

// Tokens are 256-bit random values. Only a hash of each token is stored; when
// SESSION_SECRET is configured the hash is an HMAC of the token, so a database
// leak alone cannot be used to mint valid tokens.
export function generateToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  if (config.sessionSecret) {
    return crypto
      .createHmac('sha256', config.sessionSecret)
      .update(token)
      .digest('hex');
  }
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function timingSafeEqualStrings(a, b) {
  const bufferA = crypto.createHash('sha256').update(String(a)).digest();
  const bufferB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(bufferA, bufferB);
}
