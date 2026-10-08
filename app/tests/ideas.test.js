import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'ideas.test.local';
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

async function createHousehold(client, name = 'Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.household;
}

test('idea endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/ideas')).status, 401);

  const user = await createUser('idea-auth');
  assert.equal((await user.client.get('/api/ideas')).status, 403);
});

test('ideas can be created, read, listed and filtered', async () => {
  const user = await createUser('idea-crud');
  await createHousehold(user.client);

  const created = await user.client.post('/api/ideas', {
    title: 'Water filter for the kitchen',
    description: 'Countertop reverse-osmosis unit with remineralsation.',
    category: 'Home improvement',
    priority: 'HIGH',
    estimatedCost: '420.50',
    currency: 'SGD',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const idea = created.body.data.idea;
  assert.equal(idea.title, 'Water filter for the kitchen');
  assert.equal(idea.priority, 'HIGH');
  assert.equal(idea.status, 'IDEA');
  assert.equal(idea.estimatedCost, '420.5');
  assert.equal(idea.currency, 'SGD');
  assert.ok(idea.createdBy.id);

  const get = await user.client.get(`/api/ideas/${idea.id}`);
  assert.equal(get.status, 200);
  assert.equal(get.body.data.idea.title, 'Water filter for the kitchen');
  assert.equal(get.body.data.idea.task, undefined);

  await user.client.post('/api/ideas', { title: 'Family trip to Kyoto', category: 'Travel' });
  await user.client.post('/api/ideas', { title: 'New sofa', status: 'PLANNED' });

  assert.equal((await user.client.get('/api/ideas')).body.data.total, 3);
  assert.equal((await user.client.get('/api/ideas?search=sofa')).body.data.total, 1);
  assert.equal((await user.client.get('/api/ideas?category=Travel')).body.data.total, 1);
  assert.equal((await user.client.get('/api/ideas?status=PLANNED')).body.data.total, 1);

  // Decimal amounts round-trip precisely.
  const roundtrip = await user.client.post('/api/ideas', { title: 'Robot vacuum', estimatedCost: '0.05' });
  assert.equal(roundtrip.body.data.idea.estimatedCost, '0.05');
});

test('ideas validate required fields and cost format', async () => {
  const user = await createUser('idea-validate');
  await createHousehold(user.client);

  const noTitle = await user.client.post('/api/ideas', { description: 'missing title' });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.body.error.details[0].field, 'title');

  const badCost = await user.client.post('/api/ideas', { title: 'X', estimatedCost: 'ten dollars' });
  assert.equal(badCost.status, 400);
  assert.equal(badCost.body.error.details[0].field, 'estimatedCost');

  const badCurrency = await user.client.post('/api/ideas', { title: 'X', currency: 'singapore' });
  assert.equal(badCurrency.status, 400);
  assert.equal(badCurrency.body.error.details[0].field, 'currency');
});

test('ideas can be updated including clearing cost', async () => {
  const user = await createUser('idea-update');
  await createHousehold(user.client);

  const created = await user.client.post('/api/ideas', { title: 'Draft idea', estimatedCost: '100' });
  const idea = created.body.data.idea;

  const updated = await user.client.patch(`/api/ideas/${idea.id}`, {
    title: 'Concrete plan',
    status: 'IN_PROGRESS',
    priority: 'URGENT',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.idea.title, 'Concrete plan');
  assert.equal(updated.body.data.idea.status, 'IN_PROGRESS');
  assert.equal(updated.body.data.idea.priority, 'URGENT');

  const cleared = await user.client.patch(`/api/ideas/${idea.id}`, { estimatedCost: null });
  assert.equal(cleared.body.data.idea.estimatedCost, null);
});

test('ideas generate at most one linked task', async () => {
  const user = await createUser('idea-task');
  await createHousehold(user.client);

  const created = await user.client.post('/api/ideas', { title: 'Build bookshelf', priority: 'HIGH' });
  const idea = created.body.data.idea;

  const withTask = await user.client.post(`/api/ideas/${idea.id}/task`);
  assert.equal(withTask.status, 201, JSON.stringify(withTask.body));
  const task = withTask.body.data.task;
  assert.equal(task.source.type, 'IDEA');
  assert.equal(task.source.id, idea.id);
  assert.equal(task.title, 'Build bookshelf');
  assert.equal(task.priority, 'HIGH');

  // The idea now advertises its task.
  const get = await user.client.get(`/api/ideas/${idea.id}`);
  assert.ok(get.body.data.idea.task);
  assert.equal(get.body.data.idea.task.id, task.id);

  // A second task is rejected, and the linked idea cannot claim it.
  assert.equal((await user.client.post(`/api/ideas/${idea.id}/task`)).status, 409);

  const taskList = await user.client.get('/api/tasks');
  const seriesTasks = taskList.body.data.items.filter((row) => row.source?.type === 'IDEA');
  assert.equal(seriesTasks.length, 1);
});

test('ideas are isolated between households and can be deleted', async () => {
  const user = await createUser('idea-iso');
  await createHousehold(user.client);
  const created = await user.client.post('/api/ideas', { title: 'Private idea' });
  const idea = created.body.data.idea;

  const second = await createUser('idea-iso-2');
  await createHousehold(second.client);
  assert.equal((await second.client.get(`/api/ideas/${idea.id}`)).status, 404);
  assert.equal((await second.client.patch(`/api/ideas/${idea.id}`, { title: 'Hacked' })).status, 404);
  assert.equal((await second.client.del(`/api/ideas/${idea.id}`)).status, 404);
  assert.equal((await second.client.post(`/api/ideas/${idea.id}/task`)).status, 404);

  const deleted = await user.client.del(`/api/ideas/${idea.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
  assert.equal((await user.client.get(`/api/ideas/${idea.id}`)).status, 404);
});