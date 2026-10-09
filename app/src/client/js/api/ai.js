/**
 * AI Assistant API Client
 */

import { apiRequest } from './client.js';

export async function listConversations(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', params.page);
  if (params.limit) query.set('limit', params.limit);
  const qs = query.toString() ? `?${query}` : '';
  return apiRequest(`/api/ai/conversations${qs}`);
}

export async function createConversation(title = 'New Conversation') {
  return apiRequest('/api/ai/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function getConversation(id) {
  return apiRequest(`/api/ai/conversations/${encodeURIComponent(id)}`);
}

export async function deleteConversation(id) {
  return apiRequest(`/api/ai/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function renameConversation(id, title) {
  return apiRequest(`/api/ai/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export async function sendMessage(conversationId, content) {
  return apiRequest(`/api/ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function confirmAction(conversationId, toolCallId, toolName, confirmed) {
  return apiRequest(`/api/ai/conversations/${encodeURIComponent(conversationId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ toolCallId, toolName, confirmed }),
  });
}

export async function getProviderStatus() {
  return apiRequest('/api/ai/status');
}