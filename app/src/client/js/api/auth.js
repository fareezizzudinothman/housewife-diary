import { api } from './client.js';

export function registerUser(payload) {
  return api.post('/auth/register', payload);
}

export function loginUser(payload) {
  return api.post('/auth/login', payload);
}

export function logoutUser() {
  return api.post('/auth/logout');
}

export function getSession() {
  return api.get('/auth/session');
}

export function forgotPassword(email) {
  return api.post('/auth/forgot-password', { email });
}

export function resetPassword(token, password) {
  return api.post('/auth/reset-password', { token, password });
}

export function changePassword(currentPassword, newPassword) {
  return api.post('/auth/change-password', { currentPassword, newPassword });
}

export function verifyEmail(token) {
  return api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function resendVerification() {
  return api.post('/auth/verify-email/resend');
}

export function listSessions() {
  return api.get('/auth/sessions');
}

export function revokeSession(id) {
  return api.del(`/auth/sessions/${encodeURIComponent(id)}`);
}

export function revokeOtherSessions() {
  return api.del('/auth/sessions/other');
}
