import { api } from './client.js';

export function getDashboard() {
  return api.get('/dashboard');
}
