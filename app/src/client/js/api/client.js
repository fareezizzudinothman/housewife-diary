const API_BASE = '/api';
const CSRF_COOKIE_NAME = 'hd_csrf';

let csrfToken = null;

export class ApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details ?? [];
  }
}

function readCookie(name) {
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Ensures a CSRF token is available (cookie + in-memory) for unsafe requests.
async function ensureCsrfToken() {
  if (csrfToken) {
    return csrfToken;
  }
  const cookieToken = readCookie(CSRF_COOKIE_NAME);
  if (cookieToken) {
    csrfToken = cookieToken;
    return csrfToken;
  }
  const response = await fetch(`${API_BASE}/auth/csrf`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null);
  if (body?.success === true && typeof body.data?.token === 'string') {
    csrfToken = body.data.token;
  }
  return csrfToken;
}

function isCsrfFailure(status, parsed) {
  return status === 403 && /csrf/i.test(parsed?.error?.message ?? '');
}

export async function apiRequest(path, { method = 'GET', body, retryCsrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  const isUnsafe = method !== 'GET' && method !== 'HEAD';
  if (isUnsafe) {
    const token = await ensureCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => null);
  if (!response.ok || parsed?.success !== true) {
    // A stale CSRF token is the one recoverable failure: refresh it once.
    if (isUnsafe && retryCsrf && isCsrfFailure(response.status, parsed)) {
      csrfToken = null;
      return apiRequest(path, { method, body, retryCsrf: false });
    }
    throw new ApiError(parsed?.error?.message ?? `Request failed with status ${response.status}.`, {
      code: parsed?.error?.code,
      status: response.status,
      details: parsed?.error?.details,
    });
  }
  return parsed.data;
}

export const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body }),
  del: (path) => apiRequest(path, { method: 'DELETE' }),
};

// Raw binary upload (diary attachments): the file itself is the request
// body and the display name travels percent-encoded in X-Filename.
export async function apiUpload(path, file, { retryCsrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  const token = await ensureCsrfToken();
  if (token) {
    headers['X-CSRF-Token'] = token;
  }
  headers['X-Filename'] = encodeURIComponent(file.name || 'image');
  headers['Content-Type'] = file.type || 'application/octet-stream';
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    body: file,
  });
  const parsed = await response.json().catch(() => null);
  if (!response.ok || parsed?.success !== true) {
    if (retryCsrf && isCsrfFailure(response.status, parsed)) {
      csrfToken = null;
      return apiUpload(path, file, { retryCsrf: false });
    }
    throw new ApiError(parsed?.error?.message ?? `Upload failed with status ${response.status}.`, {
      code: parsed?.error?.code,
      status: response.status,
      details: parsed?.error?.details,
    });
  }
  return parsed.data;
}
