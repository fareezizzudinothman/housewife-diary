import { api } from './client.js';

// Ideas API — CRUD, optional task link. See
// docs/ideas.md for the endpoint contract.

export function listIdeas(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/ideas${suffix ? `?${suffix}` : ''}`);
}

export function getIdea(ideaId) {
  return api.get(`/ideas/${encodeURIComponent(ideaId)}`);
}

export function createIdea(payload) {
  return api.post('/ideas', payload);
}

export function updateIdea(ideaId, payload) {
  return api.patch(`/ideas/${encodeURIComponent(ideaId)}`, payload);
}

export function deleteIdea(ideaId) {
  return api.del(`/ideas/${encodeURIComponent(ideaId)}`);
}

export function generateIdeaTask(ideaId) {
  return api.post(`/ideas/${encodeURIComponent(ideaId)}/task`, {});
}