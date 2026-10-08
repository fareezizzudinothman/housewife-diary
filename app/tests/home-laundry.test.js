import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'home-laundry.test.local';
let baseUrl;
let started;

before(async () => {
  started = await startTestServer();
  baseUrl = started.baseUrl;
});

after(async () => {
  await cleanupEmailDomain(DOMAIN);
  await started.stop();
});

beforeEach(() => {
  resetRateLimits();
  resetAuthThrottles();
  clearOutbox();
});

async function createUser(label) {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label });
  return { client, email };
}

async function createHousehold(client) {
  const response = await client.post('/api/households', { name: 'Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
}

async function createItem(client, data = {}) {
  const response = await client.post('/api/home/laundry', {
    category: 'Clothes',
    scheduledDate: '2026-10-15',
    ...data,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.item;
}

test('laundry endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/home/laundry')).status, 401);

  const user = await createUser('laundry-auth');
  assert.equal((await user.client.get('/api/home/laundry')).status, 403);
});

test('laundry items support create, get, list and status updates', async () => {
  const user = await createUser('laundry-crud');
  await createHousehold(user.client);

  const item = await createItem(user.client);
  assert.equal(item.category, 'Clothes');
  assert.equal(item.status, 'PENDING');
  assert.equal(item.scheduledDate, '2026-10-15');

  const fetched = await user.client.get(`/api/home/laundry/${item.id}`);
  assert.equal(fetched.status, 200);

  const updated = await user.client.patch(`/api/home/laundry/${item.id}`, { status: 'WASHING' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.item.status, 'WASHING');

  const completed = await user.client.patch(`/api/home/laundry/${item.id}`, { status: 'COMPLETED' });
  assert.equal(completed.status, 200);

  const cleared = await user.client.patch(`/api/home/laundry/${item.id}`, { scheduledDate: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.item.scheduledDate, null);

  const list = await user.client.get('/api/home/laundry');
  assert.equal(list.body.data.total, 1);

  const filtered = await user.client.get('/api/home/laundry?status=COMPLETED');
  assert.equal(filtered.body.data.total, 1);

  const empty = await user.client.get('/api/home/laundry?status=PENDING');
  assert.equal(empty.body.data.total, 0);

  const badStatus = await user.client.patch(`/api/home/laundry/${item.id}`, { status: 'DONE' });
  assert.equal(badStatus.status, 400);
  assert.equal(badStatus.body.error.details[0].field, 'status');

  const deleted = await user.client.del(`/api/home/laundry/${item.id}`);
  assert.equal(deleted.status, 200);
  assert.equal((await user.client.get('/api/home/laundry')).body.data.total, 0);
});

test('laundry requires a category and rejects foreign access', async () => {
  const user = await createUser('laundry-validate');
  await createHousehold(user.client);

  const noCategory = await user.client.post('/api/home/laundry', { scheduledDate: '2026-10-10' });
  assert.equal(noCategory.status, 400);
  assert.equal(noCategory.body.error.details[0].field, 'category');

  const item = await createItem(user.client, { category: 'Towels' });

  const secondUser = await createUser('laundry-iso');
  await createHousehold(secondUser.client);
  assert.equal((await secondUser.client.get(`/api/home/laundry/${item.id}`)).status, 404);
  assert.equal((await secondUser.client.patch(`/api/home/laundry/${item.id}`, { status: 'COMPLETED' })).status, 404);
  assert.equal((await secondUser.client.del(`/api/home/laundry/${item.id}`)).status, 404);
});