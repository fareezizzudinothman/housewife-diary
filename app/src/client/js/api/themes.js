import { api } from './client.js';

// Preset catalog (public — used to theme pages before sign-in).
export function listThemes() {
  return api.get('/themes');
}

// Current user's resolved appearance.
export function getMyTheme() {
  return api.get('/themes/me');
}

// Partial update; returns the full resolved appearance.
export function updateMyTheme(patch) {
  return api.patch('/themes/me', patch);
}

// Reset stored appearance preferences.
export function resetMyTheme() {
  return api.del('/themes/me');
}
