import assert from 'node:assert/strict';
import { ApiClient } from './apiClient.js';

let sequence = 0;

export const TEST_PASSWORD = 'correct horse battery staple';

export function uniqueEmail(domain, label = 'user') {
  sequence += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${label}-${Date.now()}-${sequence}-${random}@${domain}`;
}

export function newClient(baseUrl) {
  return new ApiClient(baseUrl);
}

export async function registerUser(client, {
  domain,
  label = 'user',
  name = 'Test User',
  password = TEST_PASSWORD,
  timezone = 'UTC',
  email,
} = {}) {
  const finalEmail = email ?? uniqueEmail(domain, label);
  const response = await client.post('/api/auth/register', { name, email: finalEmail, password, timezone });
  assert.equal(response.status, 201, `register failed: ${JSON.stringify(response.body)}`);
  return { email: finalEmail, user: response.body.data.user };
}

export async function loginUser(client, email, password = TEST_PASSWORD) {
  return client.post('/api/auth/login', { email, password });
}
