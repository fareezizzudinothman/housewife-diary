import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'home-maintenance.test.local';
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

async function createRoom(client) {
  const response = await client.post('/api/home/rooms', { name: 'Utility Room' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.room;
}

async function createMaintenance(client, data = {}) {
  const response = await client.post('/api/home/maintenance', {
    title: 'Fix leaking tap',
    category: 'Plumbing',
    priority: 'HIGH',
    scheduledDate: '2026-10-20',
    description: 'Kitchen mixer is dripping',
    ...data,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.maintenance;
}

// Builds a posted EXPENSE transaction through the finance module.
async function createExpense(client) {
  const account = await client.post('/api/finance/accounts', { name: 'Cash', type: 'CASH', currency: 'SGD' });
  assert.equal(account.status, 201, JSON.stringify(account.body));
  const category = await client.post('/api/finance/categories', { name: 'Repairs', type: 'EXPENSE' });
  assert.equal(category.status, 201, JSON.stringify(category.body));
  const transaction = await client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '120.00',
    categoryId: category.body.data.category.id,
    accountId: account.body.data.account.id,
    transactionDate: '2026-10-01',
    description: 'Plumber',
  });
  assert.equal(transaction.status, 201, JSON.stringify(transaction.body));
  return transaction.body.data.transaction;
}

test('maintenance endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/home/maintenance')).status, 401);

  const user = await createUser('maintenance-auth');
  assert.equal((await user.client.get('/api/home/maintenance')).status, 403);
});

test('maintenance jobs support create, get, update and delete', async () => {
  const user = await createUser('maintenance-crud');
  await createHousehold(user.client);

  const maintenance = await createMaintenance(user.client);
  assert.equal(maintenance.title, 'Fix leaking tap');
  assert.equal(maintenance.category, 'Plumbing');
  assert.equal(maintenance.priority, 'HIGH');
  assert.equal(maintenance.status, 'OPEN');
  assert.equal(maintenance.scheduledDate, '2026-10-20');
  assert.equal(maintenance.completedAt, null);

  const fetched = await user.client.get(`/api/home/maintenance/${maintenance.id}`);
  assert.equal(fetched.status, 200);

  const updated = await user.client.patch(`/api/home/maintenance/${maintenance.id}`, {
    status: 'COMPLETED',
    priority: 'LOW',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.maintenance.status, 'COMPLETED');
  assert.ok(updated.body.data.maintenance.completedAt);
  assert.equal(updated.body.data.maintenance.priority, 'LOW');

  // Reopening clears the completion timestamp.
  const reopened = await user.client.patch(`/api/home/maintenance/${maintenance.id}`, { status: 'IN_PROGRESS' });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.data.maintenance.completedAt, null);

  const list = await user.client.get('/api/home/maintenance');
  assert.equal(list.body.data.total, 1);

  const deleted = await user.client.del(`/api/home/maintenance/${maintenance.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
});

test('maintenance requires scheduledDate, title and category', async () => {
  const user = await createUser('maintenance-validate');
  await createHousehold(user.client);

  const noDate = await user.client.post('/api/home/maintenance', { title: 'x', category: 'Plumbing' });
  assert.equal(noDate.status, 400);
  assert.equal(noDate.body.error.details[0].field, 'scheduledDate');

  const badDate = await user.client.post('/api/home/maintenance', {
    title: 'x',
    category: 'Plumbing',
    scheduledDate: 'not-a-date',
  });
  assert.equal(badDate.status, 400);

  const noCategory = await user.client.post('/api/home/maintenance', { title: 'x', scheduledDate: '2026-10-01' });
  assert.equal(noCategory.status, 400);
  assert.equal(noCategory.body.error.details[0].field, 'category');
});

test('maintenance can link to a room and to an expense transaction', async () => {
  const user = await createUser('maintenance-link');
  await createHousehold(user.client);
  const room = await createRoom(user.client);
  const transaction = await createExpense(user.client);

  const maintenance = await createMaintenance(user.client, {
    roomId: room.id,
    transactionId: transaction.id,
  });
  assert.equal(maintenance.room.name, 'Utility Room');
  assert.equal(maintenance.transactionId, transaction.id);

  // An income transaction is not a valid cost reference.
  const incomeCategory = await user.client.post('/api/finance/categories', { name: 'Refunds', type: 'INCOME' });
  assert.equal(incomeCategory.status, 201);
  const income = await user.client.post('/api/finance/transactions', {
    type: 'INCOME',
    amount: '50.00',
    categoryId: incomeCategory.body.data.category.id,
    accountId: transaction.account.id,
    transactionDate: '2026-10-01',
    description: 'Refund',
  });
  assert.equal(income.status, 201, JSON.stringify(income.body));
  const bad = await user.client.post('/api/home/maintenance', {
    title: 'Nope',
    category: 'Other',
    scheduledDate: '2026-11-01',
    transactionId: income.body.data.transaction.id,
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.details[0].field, 'transactionId');

  const second = await user.client.post('/api/home/maintenance', {
    title: 'Second job',
    category: 'Electrical',
    scheduledDate: '2026-11-01',
    transactionId: transaction.id,
  });
  assert.equal(second.status, 400);
  assert.equal(second.body.error.details[0].field, 'transactionId');
});

test('maintenance generates a single task on demand', async () => {
  const user = await createUser('maintenance-task');
  await createHousehold(user.client);
  const maintenance = await createMaintenance(user.client);

  const generated = await user.client.post(`/api/home/maintenance/${maintenance.id}/task`);
  assert.equal(generated.status, 201, JSON.stringify(generated.body));
  const task = generated.body.data.task;
  assert.equal(task.source.type, 'MAINTENANCE');
  assert.equal(task.source.id, maintenance.id);
  assert.equal(task.title, 'Fix leaking tap');
  assert.equal(task.priority, 'HIGH');

  const again = await user.client.post(`/api/home/maintenance/${maintenance.id}/task`);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'CONFLICT');

  // A missing / foreign maintenance cannot generate a task.
  const secondUser = await createUser('maintenance-iso');
  await createHousehold(secondUser.client);
  assert.equal((await secondUser.client.get(`/api/home/maintenance/${maintenance.id}`)).status, 404);
  assert.equal((await secondUser.client.post(`/api/home/maintenance/${maintenance.id}/task`)).status, 404);

  // Deleting the generated (non-recurring) task removes only itself.
  assert.equal((await user.client.del(`/api/tasks/${task.id}`)).status, 200);
  assert.equal((await user.client.post(`/api/home/maintenance/${maintenance.id}/task`)).status, 201);
});