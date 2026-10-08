import { api } from './client.js';

// Tasks API — household-scoped tasks, categories and recurrence. See
// docs/tasks.md for the endpoint contract.

export function listTasks(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return api.get(`/tasks${suffix ? `?${suffix}` : ''}`);
}

export function getTaskMeta() {
  return api.get('/tasks/meta');
}

export function getTask(taskId) {
  return api.get(`/tasks/${encodeURIComponent(taskId)}`);
}

export function createTask(payload) {
  return api.post('/tasks', payload);
}

export function updateTask(taskId, payload) {
  return api.patch(`/tasks/${encodeURIComponent(taskId)}`, payload);
}

export function completeTask(taskId) {
  return api.post(`/tasks/${encodeURIComponent(taskId)}/complete`, {});
}

export function deleteTask(taskId, { series = false } = {}) {
  const suffix = series ? '?series=true' : '';
  return api.del(`/tasks/${encodeURIComponent(taskId)}${suffix}`);
}

export function listTaskCategories() {
  return api.get('/tasks/categories');
}

export function createTaskCategory(name) {
  return api.post('/tasks/categories', { name });
}

export function deleteTaskCategory(categoryId) {
  return api.del(`/tasks/categories/${encodeURIComponent(categoryId)}`);
}
