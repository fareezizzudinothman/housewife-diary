import {
  SESSION_CAP_REMEMBER_MS,
  SESSION_CAP_SHORT_MS,
  SESSION_TTL_REMEMBER_MS,
  SESSION_TTL_SHORT_MS,
  generateToken,
  hashToken,
} from '../utils/tokens.js';
import { logAuthEvent } from '../utils/audit.js';
import * as sessionRepository from '../repositories/sessionRepository.js';

function ttlFor(rememberMe) {
  return rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_SHORT_MS;
}

function capFor(rememberMe) {
  return rememberMe ? SESSION_CAP_REMEMBER_MS : SESSION_CAP_SHORT_MS;
}

export function sessionCookieMaxAgeMs(session) {
  return ttlFor(session.rememberMe);
}

// Creates a server-side session; only the hash of the random token is stored.
export async function createSession(user, { rememberMe = false, ip = null, userAgent = null } = {}) {
  const { token, hash } = generateToken();
  const now = Date.now();
  const session = await sessionRepository.create({
    userId: user.id,
    tokenHash: hash,
    expiresAt: new Date(now + ttlFor(rememberMe)),
    rememberMe,
    ip,
    userAgent,
  });
  return { session, token };
}

// Resolves a raw cookie token to a valid session (with user). Expired
// sessions are deleted. Sliding renewal: when less than half the TTL remains
// and the session is still used, the expiry is extended, capped at 3x TTL
// since creation.
export async function resolveSession(rawToken) {
  const tokenHash = hashToken(rawToken);
  const session = await sessionRepository.findByTokenHash(tokenHash);
  if (!session) {
    return null;
  }
  const now = Date.now();
  const expiresAt = session.expiresAt.getTime();
  if (expiresAt <= now) {
    await sessionRepository.deleteByTokenHash(tokenHash);
    return null;
  }
  const ttl = ttlFor(session.rememberMe);
  const cap = session.createdAt.getTime() + capFor(session.rememberMe);
  if (expiresAt - now < ttl / 2) {
    const newExpiry = Math.min(now + ttl, cap);
    if (newExpiry > expiresAt) {
      session.expiresAt = new Date(newExpiry);
      await sessionRepository.extendExpiry(session.id, session.expiresAt).catch(() => {
        // A concurrent renewal or revocation is harmless; ignore.
      });
    }
  }
  return session;
}

export async function revokeSessionByToken(rawToken) {
  const deleted = await sessionRepository.deleteByTokenHash(hashToken(rawToken));
  return deleted.count > 0;
}

export async function revokeAllSessionsForUser(userId) {
  const deleted = await sessionRepository.deleteAllForUser(userId);
  if (deleted.count > 0) {
    logAuthEvent('sessions_revoked', { userId, count: deleted.count });
  }
  return deleted.count;
}

export async function revokeOtherSessions(userId, keepSessionId) {
  const deleted = await sessionRepository.deleteAllForUserExcept(userId, keepSessionId);
  if (deleted.count > 0) {
    logAuthEvent('sessions_revoked', { userId, count: deleted.count, keptSessionId: keepSessionId });
  }
  return deleted.count;
}

export function toSessionView(session, { current = false } = {}) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    rememberMe: session.rememberMe,
    ip: session.ip,
    userAgent: session.userAgent,
    current,
  };
}
