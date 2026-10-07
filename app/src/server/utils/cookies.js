// Cookie name constants — shared by the auth middleware and the controllers
// that set/clear them.
export const SESSION_COOKIE = 'hd_session';
export const CSRF_COOKIE = 'hd_csrf';

const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
};

function serialize(name, value, attributes) {
  const parts = [`${name}=${value}`];
  if (attributes.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(attributes.maxAge / 1000)}`);
  }
  if (attributes.expires) {
    parts.push(`Expires=${attributes.expires.toUTCString()}`);
  }
  if (attributes.httpOnly) {
    parts.push('HttpOnly');
  }
  if (attributes.secure) {
    parts.push('Secure');
  }
  if (attributes.sameSite) {
    parts.push(`SameSite=${attributes.sameSite}`);
  }
  if (attributes.path) {
    parts.push(`Path=${attributes.path}`);
  }
  return parts.join('; ');
}

export function parseCookieHeader(header) {
  const cookies = {};
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) {
      continue;
    }
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!name) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function setSessionCookie(res, token, { maxAge, secure }) {
  res.append(
    'Set-Cookie',
    serialize(SESSION_COOKIE, token, { ...COOKIE_ATTRIBUTES, maxAge, secure }),
  );
}

export function clearSessionCookie(res, secure) {
  res.append(
    'Set-Cookie',
    serialize(SESSION_COOKIE, '', {
      ...COOKIE_ATTRIBUTES,
      expires: new Date(0),
      maxAge: 0,
      secure,
    }),
  );
}

export function setCsrfCookie(res, token, { secure }) {
  // Not httpOnly on purpose: the client must read this value to echo it back
  // in the X-CSRF-Token header (double-submit pattern).
  res.append(
    'Set-Cookie',
    serialize(CSRF_COOKIE, token, {
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 90, // 90 days
      secure,
    }),
  );
}
