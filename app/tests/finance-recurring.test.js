import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-recurring.test.local';

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

function dateOffset(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function createUser(label) {
  const client = newClient(baseUrl);
  const { user } = await registerUser(client, { domain: DOMAIN, label });
  return { client, user };
}

async function setup(label) {
  const owner = await createUser(label);
  const response = await owner.client.post('/api/households', { name: 'Recurring Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createRecurring(client, overrides = {}) {
  const response = await client.post('/api/finance/recurring', {
    type: 'EXPENSE',
    amount: '1200.00',
    currency: 'SGD',
    categoryId: 'fcat-exp-rent',
    frequency: 'MONTHLY',
    interval: 1,
    startDate: dateOffset(0),
    description: 'Rent',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.recurring;
}

async function generatedTransactions(client) {
  const response = await client.get('/api/finance/transactions?sourceType=RECURRING&limit=50');
  assert.equal(response.status, 200);
  return response.body.data.items;
}

test('finance recurring requires authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/recurring')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/recurring')).status, 403);
});

test('recurring transactions are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const rule = await createRecurring(owner.client);

  const stranger = await setup('isolation-b');
  assert.equal((await stranger.client.get(`/api/finance/recurring/${rule.id}`)).status, 404);
  assert.equal(
    (await stranger.client.patch(`/api/finance/recurring/${rule.id}`, { amount: '1.00' })).status,
    404,
  );
  assert.equal(
    (await stranger.client.post(`/api/finance/recurring/${rule.id}/pause`, {})).status,
    404,
  );
  assert.deepEqual((await stranger.client.get('/api/finance/recurring')).body.data.items, []);
});

test('a recurring rule is created active with the start date as the next occurrence', async () => {
  const owner = await setup('create');
  const account = await owner.client.post('/api/finance/accounts', {
    name: 'Bank',
    currency: 'SGD',
  });
  const rule = await createRecurring(owner.client, {
    accountId: account.body.data.account.id,
    startDate: dateOffset(10),
    endDate: dateOffset(200),
    merchant: 'Landlord',
    notes: 'Monthly transfer',
  });

  assert.ok(rule.id.startsWith('c'));
  assert.equal(rule.type, 'EXPENSE');
  assert.equal(rule.amount, '1200.00');
  assert.equal(rule.frequency, 'MONTHLY');
  assert.equal(rule.interval, 1);
  assert.equal(rule.startDate, dateOffset(10));
  assert.equal(rule.endDate, dateOffset(200));
  assert.equal(rule.nextOccurrence, dateOffset(10));
  assert.equal(rule.active, true);
  assert.equal(rule.generatedCount, 0);
  assert.equal(rule.category.name, 'Rent');
  assert.equal(rule.account.name, 'Bank');

  // Nothing is generated before the first occurrence is due.
  const transactions = await generatedTransactions(owner.client);
  assert.deepEqual(transactions, []);
});

test('recurring creation validates type, amount, category, frequency and dates', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ type: 'TRANSFER' }, 'type'],
    [{ amount: '0' }, 'amount'],
    [{ amount: '-5.00' }, 'amount'],
    [{ amount: '1.005' }, 'amount'],
    [{ categoryId: null }, 'categoryId'],
    [{ categoryId: 'fcat-inc-salary' }, 'categoryId'],
    [{ frequency: 'HOURLY' }, 'frequency'],
    [{ interval: 0 }, 'interval'],
    [{ interval: 100 }, 'interval'],
    [{ startDate: '' }, 'startDate'],
    [{ startDate: dateOffset(10), endDate: dateOffset(5) }, 'endDate'],
  ];
  for (const [overrides, field] of cases) {
    const response = await owner.client.post('/api/finance/recurring', {
      type: 'EXPENSE',
      amount: '100.00',
      currency: 'SGD',
      categoryId: 'fcat-exp-utilities',
      frequency: 'MONTHLY',
      startDate: dateOffset(0),
      ...overrides,
    });
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(overrides)}`);
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }
});

test('listing transactions materializes due occurrences exactly once', async () => {
  const owner = await setup('generate');
  const account = await owner.client.post('/api/finance/accounts', {
    name: 'Bank',
    currency: 'SGD',
  });
  const rule = await createRecurring(owner.client, {
    amount: '35.00',
    categoryId: 'fcat-exp-utilities',
    frequency: 'WEEKLY',
    startDate: dateOffset(-14),
    description: 'Internet',
    accountId: account.body.data.account.id,
  });

  const first = await generatedTransactions(owner.client);
  assert.equal(first.length, 3);
  const dates = first.map((item) => item.transactionDate).sort();
  assert.deepEqual(dates, [dateOffset(-14), dateOffset(-7), dateOffset(0)].sort());
  for (const transaction of first) {
    assert.equal(transaction.type, 'EXPENSE');
    assert.equal(transaction.amount, '35.00');
    assert.equal(transaction.currency, 'SGD');
    assert.equal(transaction.sourceType, 'RECURRING');
    assert.equal(transaction.sourceId, rule.id);
    assert.equal(transaction.recurringTransactionId, rule.id);
    assert.equal(transaction.description, 'Internet');
    assert.equal(transaction.category.name, 'Utilities');
    assert.equal(transaction.account.name, 'Bank');
  }

  // Idempotent: a second read generates nothing new.
  const second = await generatedTransactions(owner.client);
  assert.equal(second.length, 3);

  const refreshed = await owner.client.get(`/api/finance/recurring/${rule.id}`);
  assert.equal(refreshed.body.data.recurring.generatedCount, 3);
  assert.equal(refreshed.body.data.recurring.nextOccurrence, dateOffset(7));
});

test('pausing stops generation and resuming catches up', async () => {
  const owner = await setup('pause');
  const rule = await createRecurring(owner.client, {
    type: 'INCOME',
    amount: '3000.00',
    categoryId: 'fcat-inc-salary',
    frequency: 'WEEKLY',
    startDate: dateOffset(-7),
    description: 'Weekly wage',
  });

  const paused = await owner.client.post(`/api/finance/recurring/${rule.id}/pause`, {});
  assert.equal(paused.status, 200);
  assert.equal(paused.body.data.recurring.active, false);

  assert.deepEqual(await generatedTransactions(owner.client), []);

  const resumed = await owner.client.post(`/api/finance/recurring/${rule.id}/resume`, {});
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.data.recurring.active, true);

  await generatedTransactions(owner.client);
  const generated = await generatedTransactions(owner.client);
  assert.equal(generated.length, 2);
  assert.deepEqual(
    generated.map((item) => item.transactionDate).sort(),
    [dateOffset(-7), dateOffset(0)].sort(),
  );
});

test('an end date stops generation and exhausts the rule', async () => {
  const owner = await setup('end-date');
  const rule = await createRecurring(owner.client, {
    frequency: 'WEEKLY',
    startDate: dateOffset(-21),
    endDate: dateOffset(-10),
  });

  const generated = await generatedTransactions(owner.client);
  assert.equal(generated.length, 2);
  assert.deepEqual(
    generated.map((item) => item.transactionDate).sort(),
    [dateOffset(-21), dateOffset(-14)].sort(),
  );

  const refreshed = await owner.client.get(`/api/finance/recurring/${rule.id}`);
  assert.equal(refreshed.body.data.recurring.nextOccurrence, null);

  const again = await generatedTransactions(owner.client);
  assert.equal(again.length, 2);
});

test('amount and schedule metadata can be edited; generated history keeps its snapshot', async () => {
  const owner = await setup('update');
  const rule = await createRecurring(owner.client, {
    type: 'INCOME',
    amount: '1000.00',
    categoryId: 'fcat-inc-freelance',
    frequency: 'WEEKLY',
    startDate: dateOffset(-7),
  });

  // Update before the first materialization: generation uses the new amount.
  const updated = await owner.client.patch(`/api/finance/recurring/${rule.id}`, {
    amount: '1500.00',
    description: 'Consulting',
    interval: 1,
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.recurring.amount, '1500.00');
  assert.equal(updated.body.data.recurring.description, 'Consulting');

  const generated = await generatedTransactions(owner.client);
  assert.equal(generated.length, 2);
  assert.deepEqual([...new Set(generated.map((item) => item.amount))], ['1500.00']);

  // Changing the amount again leaves already-posted history untouched.
  await owner.client.patch(`/api/finance/recurring/${rule.id}`, { amount: '1600.00' });
  const history = await generatedTransactions(owner.client);
  assert.deepEqual([...new Set(history.map((item) => item.amount))], ['1500.00']);

  for (const immutable of [
    { type: 'EXPENSE' },
    { frequency: 'MONTHLY' },
    { startDate: dateOffset(0) },
    { currency: 'USD' },
  ]) {
    const response = await owner.client.patch(`/api/finance/recurring/${rule.id}`, immutable);
    assert.equal(response.status, 400, JSON.stringify(immutable));
  }

  const empty = await owner.client.patch(`/api/finance/recurring/${rule.id}`, {});
  assert.equal(empty.status, 400);
});

test('recurring list filters by active state and type', async () => {
  const owner = await setup('filters');
  const active = await createRecurring(owner.client, { type: 'EXPENSE' });
  const paused = await createRecurring(owner.client, {
    type: 'INCOME',
    categoryId: 'fcat-inc-salary',
    startDate: dateOffset(30),
  });
  await owner.client.post(`/api/finance/recurring/${paused.id}/pause`, {});

  const all = await owner.client.get('/api/finance/recurring');
  assert.equal(all.body.data.total, 2);

  const activeOnly = await owner.client.get('/api/finance/recurring?active=ACTIVE');
  assert.deepEqual(activeOnly.body.data.items.map((item) => item.id), [active.id]);

  const pausedOnly = await owner.client.get('/api/finance/recurring?active=PAUSED');
  assert.deepEqual(pausedOnly.body.data.items.map((item) => item.id), [paused.id]);

  const incomeOnly = await owner.client.get('/api/finance/recurring?type=INCOME');
  assert.deepEqual(incomeOnly.body.data.items.map((item) => item.id), [paused.id]);
});

test('a daily rule materializes one occurrence per day up to today', async () => {
  const owner = await setup('daily');
  const rule = await createRecurring(owner.client, {
    amount: '4.50',
    categoryId: 'fcat-exp-utilities',
    frequency: 'DAILY',
    startDate: dateOffset(-3),
    description: 'Daily transit',
  });

  const generated = await generatedTransactions(owner.client);
  assert.equal(generated.length, 4);
  const dates = generated.map((item) => item.transactionDate).sort();
  assert.deepEqual(dates, [dateOffset(-3), dateOffset(-2), dateOffset(-1), dateOffset(0)].sort());
  for (const transaction of generated) {
    assert.equal(transaction.amount, '4.50');
    assert.equal(transaction.sourceType, 'RECURRING');
    assert.equal(transaction.description, 'Daily transit');
  }

  // Idempotent: a second read generates nothing new.
  const second = await generatedTransactions(owner.client);
  assert.equal(second.length, 4);

  const refreshed = await owner.client.get(`/api/finance/recurring/${rule.id}`);
  assert.equal(refreshed.body.data.recurring.generatedCount, 4);
  assert.equal(refreshed.body.data.recurring.nextOccurrence, dateOffset(1));
});
