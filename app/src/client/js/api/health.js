import { api } from './client.js';

export function getHealth() {
  return api.get('/health');
}
