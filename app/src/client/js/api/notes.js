import { api } from './client.js';

// Notes API — CRUD, tags, pinning, archiving. See
// docs/notes.md for the endpoint contract.

export function listNoteTags() {
  return api.get('/notes/tags');
}

export function listNotes(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/notes${suffix ? `?${suffix}` : ''}`);
}

export function getNote(noteId) {
  return api.get(`/notes/${encodeURIComponent(noteId)}`);
}

export function createNote(payload) {
  return api.post('/notes', payload);
}

export function updateNote(noteId, payload) {
  return api.patch(`/notes/${encodeURIComponent(noteId)}`, payload);
}

export function deleteNote(noteId) {
  return api.del(`/notes/${encodeURIComponent(noteId)}`);
}