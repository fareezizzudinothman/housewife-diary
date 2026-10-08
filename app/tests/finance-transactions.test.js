import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-transactions.test.local';

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
  const response = await owner.client.post('/api/households', { name: 'Ledger Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createAccount(client, overrides = {}) {
  const response = await client.post('/api/finance/accounts', {
    name: 'Bank',
    type: 'BANK',
    currency: 'SGD',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.account;
}

async function createTransaction(client, overrides = {}) {
  const response = await client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '120.50',
    currency: 'SGD',
    categoryId: 'fcat-exp-groceries',
    transactionDate: '2026-10-08',
    description: 'Groceries',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.transaction;
}

// ---- Access control ----

test('finance transactions require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/transactions')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/transactions')).status, 403);
});

test('finance transactions are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const transaction = await createTransaction(owner.client);

  const stranger = await setup('isolation-b');
  assert.equal((await stranger.client.get(`/api/finance/transactions/${transaction.id}`)).status, 404);
  assert.equal(
    (await stranger.client.patch(`/api/finance/transactions/${transaction.id}`, { notes: 'X' })).status,
    404,
  );
  assert.equal(
    (await stranger.client.post(`/api/finance/transactions/${transaction.id}/void`, {})).status,
    404,
  );
  assert.deepEqual((await stranger.client.get('/api/finance/transactions')).body.data.items, []);
});

// ---- Create ----

test('an expense keeps its exact amount and links category, account and merchant', async () => {
  const owner = await setup('expense');
  const account = await createAccount(owner.client, { name: 'DBS' });

  const response = await owner.client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '120.50',
    currency: 'SGD',
    categoryId: 'fcat-exp-groceries',
    accountId: account.id,
    transactionDate: '2026-10-08',
    description: 'Weekly groceries',
    merchant: 'NTUC FairPrice',
    notes: 'Included household items',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const transaction = response.body.data.transaction;
  assert.ok(transaction.id.startsWith('c'));
  assert.equal(transaction.type, 'EXPENSE');
  assert.equal(transaction.status, 'POSTED');
  assert.equal(transaction.amount, '120.50');
  assert.equal(transaction.currency, 'SGD');
  assert.equal(transaction.transactionDate, '2026-10-08');
  assert.equal(transaction.description, 'Weekly groceries');
  assert.equal(transaction.merchant, 'NTUC FairPrice');
  assert.equal(transaction.category.id, 'fcat-exp-groceries');
  assert.equal(transaction.category.name, 'Groceries');
  assert.equal(transaction.category.type, 'EXPENSE');
  assert.equal(transaction.account.id, account.id);
  assert.equal(transaction.counterAccount, null);
  assert.equal(transaction.sourceType, 'MANUAL');
  assert.equal(transaction.hasReceipt, false);

  const fetched = await owner.client.get(`/api/finance/transactions/${transaction.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.transaction.merchant, 'NTUC FairPrice');
});

test('income is recorded with an income category', async () => {
  const owner = await setup('income');
  const transaction = await createTransaction(owner.client, {
    type: 'INCOME',
    amount: '4500.00',
    categoryId: 'fcat-inc-salary',
    description: 'October salary',
  });
  assert.equal(transaction.type, 'INCOME');
  assert.equal(transaction.amount, '4500.00');
  assert.equal(transaction.category.name, 'Salary');
});

test('transfers move money between accounts without becoming income or expense', async () => {
  const owner = await setup('transfer');
  const bank = await createAccount(owner.client, { name: 'Bank', currency: 'SGD' });
  const cash = await createAccount(owner.client, { name: 'Cash', currency: 'SGD' });

  const response = await owner.client.post('/api/finance/transactions', {
    type: 'TRANSFER',
    amount: '500.00',
    accountId: bank.id,
    counterAccountId: cash.id,
    transactionDate: '2026-10-08',
    description: 'ATM withdrawal',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const transfer = response.body.data.transaction;
  assert.equal(transfer.type, 'TRANSFER');
  assert.equal(transfer.currency, 'SGD');
  assert.equal(transfer.amount, '500.00');
  assert.equal(transfer.category, null);

  const list = await owner.client.get('/api/finance/transactions?type=TRANSFER');
  assert.equal(list.body.data.total, 1);

  // Reports must not see the transfer as income or expense.
  const report = await owner.client.get('/api/finance/reports/monthly?year=2026&month=10');
  assert.equal(report.body.data.income, '0.00');
  assert.equal(report.body.data.expenses, '0.00');
  assert.equal(report.body.data.net, '0.00');
  assert.equal(report.body.data.transactionCount, 0);
});

test('transfers validate accounts, currencies and categories', async () => {
  const owner = await setup('transfer-validate');
  const bank = await createAccount(owner.client, { name: 'Bank', currency: 'SGD' });
  const cash = await createAccount(owner.client, { name: 'Cash', currency: 'SGD' });
  const usd = await createAccount(owner.client, { name: 'USD account', currency: 'USD' });

  const base = {
    type: 'TRANSFER',
    amount: '10.00',
    transactionDate: '2026-10-08',
  };

  const same = await owner.client.post('/api/finance/transactions', {
    ...base,
    accountId: bank.id,
    counterAccountId: bank.id,
  });
  assert.equal(same.status, 400);
  assert.ok(same.body.error.details.some((detail) => detail.field === 'counterAccountId'));

  const mixed = await owner.client.post('/api/finance/transactions', {
    ...base,
    accountId: bank.id,
    counterAccountId: usd.id,
  });
  assert.equal(mixed.status, 400);
  assert.ok(mixed.body.error.details.some((detail) => detail.field === 'counterAccountId'));

  const missingDestination = await owner.client.post('/api/finance/transactions', {
    ...base,
    accountId: bank.id,
  });
  assert.equal(missingDestination.status, 400);

  const withCategory = await owner.client.post('/api/finance/transactions', {
    ...base,
    accountId: bank.id,
    counterAccountId: cash.id,
    categoryId: 'fcat-exp-other',
  });
  assert.equal(withCategory.status, 400);
  assert.ok(withCategory.body.error.details.some((detail) => detail.field === 'categoryId'));
});

test('transaction validation rejects bad money, types, categories and accounts', async () => {
  const owner = await setup('validate');
  const usd = await createAccount(owner.client, { name: 'USD account', currency: 'USD' });

  const cases = [
    [{ amount: '0' }, 'amount'],
    [{ amount: '-5.00' }, 'amount'],
    [{ amount: '1.005' }, 'amount'],
    [{ amount: 'NaN' }, 'amount'],
    [{ amount: 'Infinity' }, 'amount'],
    [{ amount: '9999999999999.99' }, 'amount'],
    [{ type: 'REFUND' }, 'type'],
    [{ categoryId: null }, 'categoryId'],
    [{ categoryId: 'fcat-inc-salary' }, 'categoryId'],
    [{ categoryId: 'cmisssing0000000000000000' }, 'categoryId'],
    [{ transactionDate: '2026-02-30' }, 'transactionDate'],
    [{ accountId: 'cmisssing0000000000000000' }, 'accountId'],
    [{ accountId: usd.id }], // currency mismatch with SGD payload
  ];
  for (const [overrides] of cases) {
    const response = await owner.client.post('/api/finance/transactions', {
      type: 'EXPENSE',
      amount: '10.00',
      currency: 'SGD',
      categoryId: 'fcat-exp-food',
      transactionDate: '2026-10-08',
      ...overrides,
    });
    assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(overrides)}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('a category from another household cannot be used', async () => {
  const stranger = await setup('category-owner');
  const foreign = await stranger.client.post('/api/finance/categories', {
    name: 'Foreign category',
    type: 'EXPENSE',
  });
  const foreignId = foreign.body.data.category.id;

  const owner = await setup('category-user');
  const response = await owner.client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '10.00',
    currency: 'SGD',
    categoryId: foreignId,
    transactionDate: '2026-10-08',
  });
  assert.equal(response.status, 400);
  assert.ok(response.body.error.details.some((detail) => detail.field === 'categoryId'));
});

// ---- Update and void policy ----

test('only presentation fields can be edited on a posted transaction', async () => {
  const owner = await setup('update');
  const transaction = await createTransaction(owner.client);

  const updated = await owner.client.patch(`/api/finance/transactions/${transaction.id}`, {
    description: 'Rewritten description',
    merchant: 'Cold Storage',
    notes: 'Correction',
    transactionDate: '2026-10-09',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.transaction.description, 'Rewritten description');
  assert.equal(updated.body.data.transaction.merchant, 'Cold Storage');
  assert.equal(updated.body.data.transaction.transactionDate, '2026-10-09');
  assert.equal(updated.body.data.transaction.amount, '120.50');

  const categoryChange = await owner.client.patch(`/api/finance/transactions/${transaction.id}`, {
    categoryId: 'fcat-exp-food',
  });
  assert.equal(categoryChange.status, 200);
  assert.equal(categoryChange.body.data.transaction.category.name, 'Food');

  const wrongType = await owner.client.patch(`/api/finance/transactions/${transaction.id}`, {
    categoryId: 'fcat-inc-salary',
  });
  assert.equal(wrongType.status, 400);

  for (const immutable of [
    { amount: '1.00' },
    { type: 'INCOME' },
    { currency: 'USD' },
    { accountId: null },
    { status: 'VOIDED' },
  ]) {
    const response = await owner.client.patch(
      `/api/finance/transactions/${transaction.id}`,
      immutable,
    );
    assert.equal(response.status, 400, JSON.stringify(immutable));
  }
});

test('voiding preserves the row, excludes it by default and blocks re-editing', async () => {
  const owner = await setup('void');
  const transaction = await createTransaction(owner.client);

  const voided = await owner.client.post(`/api/finance/transactions/${transaction.id}/void`, {
    reason: 'Duplicate entry',
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.body));
  assert.equal(voided.body.data.transaction.status, 'VOIDED');
  assert.ok(voided.body.data.transaction.voidedAt);
  assert.equal(voided.body.data.transaction.voidReason, 'Duplicate entry');

  const defaultList = await owner.client.get('/api/finance/transactions');
  assert.deepEqual(defaultList.body.data.items, []);

  const voidedList = await owner.client.get('/api/finance/transactions?status=VOIDED');
  assert.equal(voidedList.body.data.total, 1);

  const all = await owner.client.get('/api/finance/transactions?status=ALL');
  assert.equal(all.body.data.total, 1);
  assert.equal(all.body.data.items[0].status, 'VOIDED');

  const voidAgain = await owner.client.post(`/api/finance/transactions/${transaction.id}/void`, {});
  assert.equal(voidAgain.status, 409);

  const edit = await owner.client.patch(`/api/finance/transactions/${transaction.id}`, {
    notes: 'Nope',
  });
  assert.equal(edit.status, 409);
});

// ---- Listing ----

test('transactions can be filtered by type, category, account, date and search', async () => {
  const owner = await setup('list');
  const bank = await createAccount(owner.client, { name: 'Bank' });
  const cash = await createAccount(owner.client, { name: 'Cash' });

  await createTransaction(owner.client, {
    amount: '10.00',
    categoryId: 'fcat-exp-food',
    accountId: bank.id,
    description: 'Lunch',
    merchant: 'Hawker',
    transactionDate: '2026-10-01',
  });
  await createTransaction(owner.client, {
    amount: '20.00',
    categoryId: 'fcat-exp-groceries',
    accountId: cash.id,
    description: 'Market run',
    transactionDate: '2026-10-05',
  });
  await createTransaction(owner.client, {
    type: 'INCOME',
    amount: '3000.00',
    categoryId: 'fcat-inc-salary',
    accountId: bank.id,
    description: 'Salary',
    transactionDate: '2026-10-10',
  });
  await owner.client.post('/api/finance/transactions', {
    type: 'TRANSFER',
    amount: '100.00',
    accountId: bank.id,
    counterAccountId: cash.id,
    transactionDate: '2026-10-11',
  });

  const expenses = await owner.client.get('/api/finance/transactions?type=EXPENSE');
  assert.equal(expenses.body.data.total, 2);

  const byCategory = await owner.client.get(
    '/api/finance/transactions?categoryId=fcat-exp-groceries',
  );
  assert.deepEqual(byCategory.body.data.items.map((item) => item.description), ['Market run']);

  // Account filter matches transfers on either side.
  const byAccount = await owner.client.get(`/api/finance/transactions?accountId=${bank.id}`);
  assert.equal(byAccount.body.data.total, 3);
  const byCounter = await owner.client.get(`/api/finance/transactions?accountId=${cash.id}`);
  assert.equal(byCounter.body.data.total, 2);

  const ranged = await owner.client.get(
    '/api/finance/transactions?from=2026-10-02&to=2026-10-06',
  );
  assert.deepEqual(ranged.body.data.items.map((item) => item.description), ['Market run']);

  const searched = await owner.client.get('/api/finance/transactions?search=hawker');
  assert.deepEqual(searched.body.data.items.map((item) => item.description), ['Lunch']);

  const paged = await owner.client.get('/api/finance/transactions?limit=2&page=2');
  assert.equal(paged.body.data.total, 4);
  assert.equal(paged.body.data.totalPages, 2);
  assert.equal(paged.body.data.items.length, 2);

  const invalidRange = await owner.client.get(
    '/api/finance/transactions?from=2026-10-10&to=2026-10-01',
  );
  assert.equal(invalidRange.status, 400);
});

test('transaction amounts round-trip exactly at two decimal places', async () => {
  const owner = await setup('precision');
  const first = await createTransaction(owner.client, { amount: '0.10' });
  const second = await createTransaction(owner.client, { amount: '0.20' });
  assert.equal(first.amount, '0.10');
  assert.equal(second.amount, '0.20');

  // Exact money math is exercised through the monthly report.
  const report = await owner.client.get('/api/finance/reports/monthly?year=2026&month=10');
  assert.equal(report.body.data.expenses, '0.30');
});
