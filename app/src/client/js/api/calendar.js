import { api } from './client.js';

// Calendar API — native events plus task-derived items (read-only). See
// docs/calendar.md for the endpoint contract.

export function listCalendarEvents({ from, to } = {}) {
  const query = new URLSearchParams();
  if (from) {
    query.set('from', from);
  }
  if (to) {
    query.set('to', to);
  }
  const suffix = query.toString();
  return api.get(`/calendar${suffix ? `?${suffix}` : ''}`);
}

export function getCalendarEvent(eventId) {
  return api.get(`/calendar/${encodeURIComponent(eventId)}`);
}

export function createCalendarEvent(payload) {
  return api.post('/calendar', payload);
}

export function updateCalendarEvent(eventId, payload) {
  return api.patch(`/calendar/${encodeURIComponent(eventId)}`, payload);
}

export function deleteCalendarEvent(eventId) {
  return api.del(`/calendar/${encodeURIComponent(eventId)}`);
}
