import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-reports.test.local';

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
  const response = await owner.client.post('/api/households', { name: 'Report Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createAccount(client, overrides = {}) {
  const response = await client.post('/api/finance/accounts', {
    name: 'Main',
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
    amount: '10.00',
    currency: 'SGD',
    categoryId: 'fcat-exp-other',
    transactionDate: '2026-10-08',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.transaction;
}

async function seedOctober(owner) {
  const main = await createAccount(owner.client, { openingBalance: '100.00' });
  const cash = await createAccount(owner.client, { name: 'Cash', openingBalance: '0.00' });
  const usd = await createAccount(owner.client, {
    name: 'US account',
    currency: 'USD',
    openingBalance: '50.00',
  });

  await createTransaction(owner.client, {
    type: 'INCOME',
    amount: '4500.00',
    categoryId: 'fcat-inc-salary',
    accountId: main.id,
    transactionDate: '2026-10-01',
    description: 'October salary',
  });
  await createTransaction(owner.client, {
    amount: '120.50',
    categoryId: 'fcat-exp-groceries',
    accountId: main.id,
    transactionDate: '2026-10-02',
    description: 'Groceries',
  });
  await createTransaction(owner.client, {
    amount: '80.25',
    categoryId: 'fcat-exp-food',
    accountId: main.id,
    transactionDate: '2026-10-03',
    description: 'Dining',
  });
  const transfer = await owner.client.post('/api/finance/transactions', {
    type: 'TRANSFER',
    amount: '500.00',
    accountId: main.id,
    counterAccountId: cash.id,
    transactionDate: '2026-10-04',
  });
  assert.equal(transfer.status, 201, JSON.stringify(transfer.body));

  const voided = await createTransaction(owner.client, {
    amount: '999.00',
    categoryId: 'fcat-exp-other',
    accountId: main.id,
    transactionDate: '2026-10-05',
  });
  await owner.client.post(`/api/finance/transactions/${voided.id}/void`, {});

  await createTransaction(owner.client, {
    amount: '60.00',
    currency: 'USD',
    categoryId: 'fcat-exp-shopping',
    accountId: usd.id,
    transactionDate: '2026-10-06',
    description: 'US shopping',
  });

  await owner.client.post('/api/finance/budgets', {
    categoryId: 'fcat-exp-groceries',
    amount: '600.00',
    currency: 'SGD',
    year: 2026,
    month: 10,
  });

  const utilities = await owner.client.post('/api/finance/bills', {
    name: 'Utilities',
    amount: '90.00',
    currency: 'SGD',
    dueDate: '2026-10-05',
    categoryId: 'fcat-exp-utilities',
  });
  await owner.client.post(`/api/finance/bills/${utilities.body.data.bill.id}/pay`, {
    transactionDate: '2026-10-05',
  });

  const internet = await owner.client.post('/api/finance/bills', {
    name: 'Internet',
    amount: '60.00',
    currency: 'SGD',
    dueDate: dateOffset(4),
    categoryId: 'fcat-exp-bills',
  });
  assert.equal(internet.status, 201, JSON.stringify(internet.body));

  return { main, usd };
}

test('monthly reports require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/reports/monthly')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/reports/monthly')).status, 403);
});

test('the monthly report computes income, expenses, net and categories per currency', async () => {
  const owner = await setup('totals');
  const { main, usd } = await seedOctober(owner);

  const response = await owner.client.get('/api/finance/reports/monthly?year=2026&month=10');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const report = response.body.data;

  assert.equal(report.year, 2026);
  assert.equal(report.month, 10);
  assert.equal(report.currency, 'SGD');
  assert.deepEqual(report.availableCurrencies, ['SGD', 'USD']);

  // Income 4500; expenses 120.50 + 80.25 + bill 90.00 = 290.75; the voided
  // 999 expense and the 500 transfer are excluded.
  assert.equal(report.income, '4500.00');
  assert.equal(report.expenses, '290.75');
  assert.equal(report.net, '4209.25');
  assert.equal(report.transactionCount, 4);

  assert.deepEqual(
    report.expenseByCategory.map((row) => [row.name, row.total]),
    [
      ['Groceries', '120.50'],
      ['Utilities', '90.00'],
      ['Food', '80.25'],
    ],
  );
  assert.deepEqual(report.incomeByCategory.map((row) => [row.name, row.total]), [
    ['Salary', '4500.00'],
  ]);
  assert.equal(report.topExpenseCategories.length, 3);
  assert.equal(report.topExpenseCategories[0].rank, 1);

  // USD activity never leaks into the SGD totals.
  const usdReport = await owner.client.get(
    '/api/finance/reports/monthly?year=2026&month=10&currency=USD',
  );
  assert.equal(usdReport.body.data.currency, 'USD');
  assert.equal(usdReport.body.data.income, '0.00');
  assert.equal(usdReport.body.data.expenses, '60.00');
  assert.deepEqual(usdReport.body.data.expenseByCategory.map((row) => row.name), ['Shopping']);

  // Budgets and account balances are currency-scoped too.
  assert.equal(report.budgetTotals.amount, '600.00');
  assert.equal(report.budgetTotals.spent, '120.50');
  assert.equal(report.budgets[0].category.name, 'Groceries');
  assert.equal(report.budgets[0].remaining, '479.50');
  assert.equal(report.budgets[0].percentUsed, 20.1);

  const accountsByName = new Map(report.accounts.map((account) => [account.name, account]));
  // 100 + 4500 - 290.75 expense - 500 transfer out (the bill had no account)
  assert.equal(accountsByName.get('Main').balance, '3899.25');
  assert.equal(accountsByName.get('Cash').balance, '500.00');
  assert.equal(accountsByName.has('US account'), false);
  assert.ok(main.id);
  assert.ok(usd.id);
});

test('the monthly report includes bill status and upcoming bills', async () => {
  const owner = await setup('bills');
  await seedOctober(owner);

  const response = await owner.client.get('/api/finance/reports/monthly?year=2026&month=10');
  const report = response.body.data;

  assert.equal(report.bills.paid, 1);
  assert.equal(report.bills.upcoming, 1);
  assert.deepEqual(
    report.upcomingBills.map((bill) => [bill.name, bill.status]),
    [['Internet', 'UPCOMING']],
  );

  const overdue = await owner.client.post('/api/finance/bills', {
    name: 'Old water bill',
    amount: '25.00',
    currency: 'SGD',
    dueDate: dateOffset(-3),
    categoryId: 'fcat-exp-utilities',
  });
  assert.equal(overdue.status, 201);
  const refreshed = await owner.client.get('/api/finance/reports/monthly?year=2026&month=10');
  assert.equal(refreshed.body.data.bills.overdue, 1);
});

test('the report defaults to the current month and the household primary currency', async () => {
  const owner = await setup('defaults');
  await createAccount(owner.client, { name: 'Main', currency: 'MYR' });

  const today = dateOffset(0);
  await createTransaction(owner.client, {
    amount: '12.30',
    currency: 'MYR',
    categoryId: 'fcat-exp-food',
    accountId: (await owner.client.get('/api/finance/accounts')).body.data.items[0].id,
    transactionDate: today,
  });

  const response = await owner.client.get('/api/finance/reports/monthly');
  assert.equal(response.status, 200);
  const report = response.body.data;
  assert.equal(report.currency, 'MYR');
  assert.equal(report.expenses, '12.30');
  assert.equal(report.month, new Date().getUTCMonth() + 1);
  assert.equal(report.year, new Date().getUTCFullYear());
});

test('the report validates month, year and currency', async () => {
  const owner = await setup('validate');

  for (const query of [
    'year=1999&month=10',
    'year=2026&month=13',
    'year=2026&month=0',
    'year=2026&month=10&currency=XYZ',
    'year=abc&month=10',
  ]) {
    const response = await owner.client.get(`/api/finance/reports/monthly?${query}`);
    assert.equal(response.status, 400, `expected 400 for ${query}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('the dashboard exposes a concise finance summary', async () => {
  const owner = await setup('dashboard');
  await createAccount(owner.client, { name: 'Main', currency: 'SGD' });

  const today = dateOffset(0);
  await createTransaction(owner.client, {
    type: 'INCOME',
    amount: '2000.00',
    categoryId: 'fcat-inc-salary',
    transactionDate: today,
  });
  await createTransaction(owner.client, {
    amount: '150.00',
    categoryId: 'fcat-exp-groceries',
    transactionDate: today,
  });

  const response = await owner.client.get('/api/dashboard');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const finance = response.body.data.finance;
  assert.equal(finance.status, 'available');
  assert.equal(finance.currency, 'SGD');
  assert.equal(finance.income, '2000.00');
  assert.equal(finance.expenses, '150.00');
  assert.equal(finance.net, '1850.00');
  assert.equal(finance.budgets.count, 0);
  assert.deepEqual(finance.upcomingBills, []);
  assert.equal(finance.overdueBillCount, 0);
});

test('the dashboard reports finance as empty before any finance data exists', async () => {
  const owner = await setup('dashboard-empty');
  const response = await owner.client.get('/api/dashboard');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.finance, {
    status: 'empty',
    currency: 'SGD',
    year: new Date().getUTCFullYear(),
    month: new Date().getUTCMonth() + 1,
    income: '0.00',
    expenses: '0.00',
    net: '0.00',
    budgets: { count: 0, amount: '0.00', spent: '0.00', percentUsed: null },
    overdueBillCount: 0,
    upcomingBills: [],
  });
});
