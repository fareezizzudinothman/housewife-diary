import { api } from './client.js';

export function listNotifications(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/notifications${suffix ? `?${suffix}` : ''}`);
}

export function getUnreadCount() {
  return api.get('/notifications/unread-count');
}

export function markRead(notificationId) {
  return api.post(`/notifications/${encodeURIComponent(notificationId)}/read`, {});
}

export function markAllRead() {
  return api.post('/notifications/read-all', {});
}

export function archiveNotification(notificationId) {
  return api.post(`/notifications/${encodeURIComponent(notificationId)}/archive`, {});
}

export function deleteNotification(notificationId) {
  return api.del(`/notifications/${encodeURIComponent(notificationId)}`);
}