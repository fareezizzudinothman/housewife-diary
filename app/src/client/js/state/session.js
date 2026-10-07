import { getSession } from '../api/auth.js';

let cached = null;

export async function loadSession({ force = false } = {}) {
  if (!cached || force) {
    cached = await getSession();
  }
  return cached;
}

export function currentSession() {
  return cached;
}

export function setCachedSession(session) {
  cached = session;
}

export function clearCachedSession() {
  cached = null;
}

// Loads the session or redirects to the login page when signed out.
export async function requireSession() {
  try {
    return await loadSession({ force: true });
  } catch (error) {
    if (error.status === 401) {
      window.location.assign('/pages/login.html');
      return null;
    }
    throw error;
  }
}
