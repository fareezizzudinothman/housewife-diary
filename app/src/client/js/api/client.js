const API_BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}.`);
  }
  return body.data;
}

export const api = {
  get: (path) => request(path),
};
