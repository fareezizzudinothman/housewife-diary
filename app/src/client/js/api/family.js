import { api } from './client.js';

// Family API — household-scoped family members and events. See
// docs/family.md for the endpoint contract.

export function getMeta() {
  return api.get('/family/meta');
}

export function listMembers(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/family/members${suffix ? `?${suffix}` : ''}`);
}

export function getMember(memberId) {
  return api.get(`/family/members/${encodeURIComponent(memberId)}`);
}

export function createMember(payload) {
  return api.post('/family/members', payload);
}

export function updateMember(memberId, payload) {
  return api.patch(`/family/members/${encodeURIComponent(memberId)}`, payload);
}

export function archiveMember(memberId) {
  return api.del(`/family/members/${encodeURIComponent(memberId)}`);
}

export function listEvents(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/family/events${suffix ? `?${suffix}` : ''}`);
}

export function getEvent(eventId) {
  return api.get(`/family/events/${encodeURIComponent(eventId)}`);
}

export function createEvent(payload) {
  return api.post('/family/events', payload);
}

export function updateEvent(eventId, payload) {
  return api.patch(`/family/events/${encodeURIComponent(eventId)}`, payload);
}

export function deleteEvent(eventId) {
  return api.del(`/family/events/${encodeURIComponent(eventId)}`);
}