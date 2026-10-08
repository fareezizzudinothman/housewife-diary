import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-budgets.test.local';

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
  const { user } = await registerUser(client, { domain: DOMAIN, label });
  return { client, user };
}

async function setup(label) {
  const owner = await createUser(label);
  const response = await owner.client.post('/api/households', { name: 'Budget Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createBudget(client, overrides = {}) {
  const response = await client.post('/api/finance/budgets', {
    categoryId: 'fcat-exp-groceries',
    amount: '600.00',
    currency: 'SGD',
    year: 2026,
    month: 10,
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.budget;
}

async function createTransaction(client, overrides = {}) {
  const response = await client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '120.50',
    currency: 'SGD',
    categoryId: 'fcat-exp-groceries',
    transactionDate: '2026-10-08',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.transaction;
}

test('finance budgets require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/budgets')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/budgets')).status, 403);
});

test('budgets are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const budget = await createBudget(owner.client);

  const stranger = await setup('isolation-b');
  assert.equal((await stranger.client.get(`/api/finance/budgets/${budget.id}`)).status, 404);
  assert.equal(
    (await stranger.client.patch(`/api/finance/budgets/${budget.id}`, { amount: '1.00' })).status,
    404,
  );
  assert.equal((await stranger.client.del(`/api/finance/budgets/${budget.id}`)).status, 404);
  assert.deepEqual((await stranger.client.get('/api/finance/budgets')).body.data.items, []);
});

test('a budget reports exact actual spending, remaining and usage', async () => {
  const owner = await setup('progress');
  const budget = await createBudget(owner.client, { amount: '600.00' });
  assert.equal(budget.spent, '0.00');
  assert.equal(budget.remaining, '600.00');
  assert.equal(budget.percentUsed, 0);
  assert.equal(budget.overBudget, false);
  assert.equal(budget.category.name, 'Groceries');

  await createTransaction(owner.client, { amount: '120.50' });
  await createTransaction(owner.client, { amount: '80.25', transactionDate: '2026-10-20' });

  const fetched = await owner.client.get(`/api/finance/budgets/${budget.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.budget.spent, '200.75');
  assert.equal(fetched.body.data.budget.remaining, '399.25');
  assert.equal(fetched.body.data.budget.percentUsed, 33.5);
  assert.equal(fetched.body.data.budget.overBudget, false);

  const listed = await owner.client.get('/api/finance/budgets?year=2026&month=10');
  assert.equal(listed.body.data.total, 1);
  assert.equal(listed.body.data.items[0].spent, '200.75');

  const otherMonth = await owner.client.get('/api/finance/budgets?year=2026&month=11');
  assert.equal(otherMonth.body.data.total, 0);
});

test('budget actuals only count posted expenses in the same category, month and currency', async () => {
  const owner = await setup('scoping');
  const budget = await createBudget(owner.client, { amount: '500.00' });

  await createTransaction(owner.client, { amount: '100.00' });
  // Other category.
  await createTransaction(owner.client, { amount: '50.00', categoryId: 'fcat-exp-food' });
  // Other month.
  await createTransaction(owner.client, { amount: '70.00', transactionDate: '2026-11-01' });
  // Income and transfer must not count.
  await createTransaction(owner.client, {
    type: 'INCOME',
    amount: '999.00',
    categoryId: 'fcat-inc-salary',
  });
  // Voided expense is excluded.
  const voided = await createTransaction(owner.client, { amount: '80.00' });
  await owner.client.post(`/api/finance/transactions/${voided.id}/void`, {});

  const fetched = await owner.client.get(`/api/finance/budgets/${budget.id}`);
  assert.equal(fetched.body.data.budget.spent, '100.00');

  // A different-currency expense does not count against an SGD budget.
  await createTransaction(owner.client, { amount: '40.00', currency: 'USD' });
  const afterUsd = await owner.client.get(`/api/finance/budgets/${budget.id}`);
  assert.equal(afterUsd.body.data.budget.spent, '100.00');
});

test('budget creation validates amount, category, type and period', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ amount: '0' }, 'amount'],
    [{ amount: '-5.00' }, 'amount'],
    [{ amount: '1.005' }, 'amount'],
    [{ categoryId: null }, 'categoryId'],
    [{ categoryId: 'cmisssing0000000000000000' }, 'categoryId'],
    [{ categoryId: 'fcat-inc-salary' }, 'categoryId'],
    [{ month: 13 }, 'month'],
    [{ month: 0 }, 'month'],
    [{ year: 1999 }, 'year'],
    [{ period: 'WEEKLY' }, 'period'],
    [{ currency: 'XYZ' }, 'currency'],
  ];
  for (const [overrides, field] of cases) {
    const response = await owner.client.post('/api/finance/budgets', {
      categoryId: 'fcat-exp-groceries',
      amount: '100.00',
      currency: 'SGD',
      year: 2026,
      month: 10,
      ...overrides,
    });
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(overrides)}`);
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }

  await createBudget(owner.client, { amount: '100.00' });
  const duplicate = await owner.client.post('/api/finance/budgets', {
    categoryId: 'fcat-exp-groceries',
    amount: '200.00',
    currency: 'SGD',
    year: 2026,
    month: 10,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');
});

test('budgets can be updated and deleted; identity fields are immutable', async () => {
  const owner = await setup('update');
  const budget = await createBudget(owner.client);

  const updated = await owner.client.patch(`/api/finance/budgets/${budget.id}`, {
    amount: '750.00',
    notes: 'Holiday month',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.budget.amount, '750.00');
  assert.equal(updated.body.data.budget.notes, 'Holiday month');

  const empty = await owner.client.patch(`/api/finance/budgets/${budget.id}`, {});
  assert.equal(empty.status, 400);

  const immutable = await owner.client.patch(`/api/finance/budgets/${budget.id}`, {
    categoryId: 'fcat-exp-food',
  });
  assert.equal(immutable.status, 400);

  const deleted = await owner.client.del(`/api/finance/budgets/${budget.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: budget.id, deleted: true });
  assert.equal((await owner.client.get(`/api/finance/budgets/${budget.id}`)).status, 404);
});

test('a household category can back a budget', async () => {
  const owner = await setup('household-category');
  const category = await owner.client.post('/api/finance/categories', {
    name: 'Kids activities',
    type: 'EXPENSE',
  });
  assert.equal(category.status, 201);

  const budget = await createBudget(owner.client, { categoryId: category.body.data.category.id });
  assert.equal(budget.category.name, 'Kids activities');
});
