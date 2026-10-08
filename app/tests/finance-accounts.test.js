import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-accounts.test.local';

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
  const response = await owner.client.post('/api/households', { name: 'Finance Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createAccount(client, overrides = {}) {
  const response = await client.post('/api/finance/accounts', {
    name: 'Cash',
    type: 'CASH',
    currency: 'SGD',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.account;
}

// ---- Access control ----

test('finance accounts require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/accounts')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/accounts')).status, 403);
});

test('finance accounts are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const account = await createAccount(owner.client);

  const stranger = await setup('isolation-b');
  assert.equal((await stranger.client.get(`/api/finance/accounts/${account.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/finance/accounts/${account.id}`, { name: 'X' })).status, 404);
  assert.equal((await stranger.client.post(`/api/finance/accounts/${account.id}/archive`, {})).status, 404);

  const list = await stranger.client.get('/api/finance/accounts');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.items, []);
});

// ---- CRUD ----

test('creating an account trims the name and applies safe defaults', async () => {
  const owner = await setup('create');

  const response = await owner.client.post('/api/finance/accounts', {
    name: '  Maybank Savings  ',
    type: 'BANK',
    currency: 'myr',
    openingBalance: '1500.50',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const account = response.body.data.account;
  assert.ok(account.id.startsWith('c'));
  assert.equal(account.name, 'Maybank Savings');
  assert.equal(account.type, 'BANK');
  assert.equal(account.currency, 'MYR');
  assert.equal(account.openingBalance, '1500.50');
  assert.equal(account.balance, '1500.50');
  assert.equal(account.active, true);

  const minimal = await owner.client.post('/api/finance/accounts', { name: 'Petty cash' });
  assert.equal(minimal.status, 201);
  assert.equal(minimal.body.data.account.currency, 'SGD');
  assert.equal(minimal.body.data.account.type, 'CASH');
  assert.equal(minimal.body.data.account.openingBalance, '0.00');
  assert.equal(minimal.body.data.account.balance, '0.00');

  const fetched = await owner.client.get(`/api/finance/accounts/${account.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.account.name, 'Maybank Savings');
});

test('creating an account validates name, type, currency and opening balance', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ name: '' }, 'name'],
    [{ name: 'x'.repeat(81) }, 'name'],
    [{ name: 'Wallet', type: 'CRYPTO' }, 'type'],
    [{ name: 'Wallet', currency: 'XYZ' }, 'currency'],
    [{ name: 'Wallet', openingBalance: '1.005' }, 'openingBalance'],
    [{ name: 'Wallet', openingBalance: 'not-money' }, 'openingBalance'],
    [{ name: 'Wallet', openingBalance: 'Infinity' }, 'openingBalance'],
  ];
  for (const [payload, field] of cases) {
    const response = await owner.client.post('/api/finance/accounts', payload);
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(payload)}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }

  // A negative opening balance is allowed (credit cards).
  const card = await owner.client.post('/api/finance/accounts', {
    name: 'Credit card',
    type: 'CREDIT_CARD',
    openingBalance: '-200.00',
  });
  assert.equal(card.status, 201, JSON.stringify(card.body));
  assert.equal(card.body.data.account.balance, '-200.00');
});

test('account names are unique per household', async () => {
  const owner = await setup('unique');
  await createAccount(owner.client, { name: 'Wallet' });

  const duplicate = await owner.client.post('/api/finance/accounts', { name: 'wallet' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');

  // The same name in another household is fine.
  const other = await setup('unique-b');
  const allowed = await createAccount(other.client, { name: 'Wallet' });
  assert.equal(allowed.name, 'Wallet');
});

test('updating an account changes metadata but guards currency changes with history', async () => {
  const owner = await setup('update');
  const account = await createAccount(owner.client, { name: 'Main', openingBalance: '10.00' });

  const renamed = await owner.client.patch(`/api/finance/accounts/${account.id}`, {
    name: 'Main account',
    type: 'BANK',
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.data.account.name, 'Main account');
  assert.equal(renamed.body.data.account.type, 'BANK');
  assert.equal(renamed.body.data.account.balance, '10.00');

  const empty = await owner.client.patch(`/api/finance/accounts/${account.id}`, {});
  assert.equal(empty.status, 400);

  const archived = await owner.client.post(`/api/finance/accounts/${account.id}/archive`, {});
  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.account.active, false);

  const defaultList = await owner.client.get('/api/finance/accounts');
  assert.deepEqual(defaultList.body.data.items.map((item) => item.name), []);

  const all = await owner.client.get('/api/finance/accounts?includeArchived=true');
  assert.deepEqual(all.body.data.items.map((item) => item.name), ['Main account']);

  const reactivated = await owner.client.patch(`/api/finance/accounts/${account.id}`, {
    active: true,
  });
  assert.equal(reactivated.body.data.account.active, true);

  // Currency can change while there is no history.
  const recurrency = await owner.client.patch(`/api/finance/accounts/${account.id}`, {
    currency: 'USD',
  });
  assert.equal(recurrency.status, 200);
  assert.equal(recurrency.body.data.account.currency, 'USD');

  // ...but not once transactions exist.
  await owner.client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '5.00',
    currency: 'USD',
    categoryId: 'fcat-exp-food',
    accountId: account.id,
    transactionDate: '2026-10-01',
  });
  const blocked = await owner.client.patch(`/api/finance/accounts/${account.id}`, {
    currency: 'SGD',
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'CONFLICT');
});

// ---- Balance derivation ----

test('account balances are derived from opening balance and posted movements', async () => {
  const owner = await setup('balance');
  const bank = await createAccount(owner.client, {
    name: 'Bank',
    type: 'BANK',
    currency: 'SGD',
    openingBalance: '1000.00',
  });
  const cash = await createAccount(owner.client, { name: 'Cash', currency: 'SGD' });

  await owner.client.post('/api/finance/transactions', {
    type: 'INCOME',
    amount: '4500.00',
    currency: 'SGD',
    categoryId: 'fcat-inc-salary',
    accountId: bank.id,
    transactionDate: '2026-10-01',
  });
  await owner.client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '120.50',
    currency: 'SGD',
    categoryId: 'fcat-exp-groceries',
    accountId: bank.id,
    transactionDate: '2026-10-02',
  });
  const transfer = await owner.client.post('/api/finance/transactions', {
    type: 'TRANSFER',
    amount: '500.00',
    currency: 'SGD',
    accountId: bank.id,
    counterAccountId: cash.id,
    transactionDate: '2026-10-03',
  });
  assert.equal(transfer.status, 201, JSON.stringify(transfer.body));

  // A voided transaction is excluded from balances.
  const voided = await owner.client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '999.00',
    currency: 'SGD',
    categoryId: 'fcat-exp-other',
    accountId: bank.id,
    transactionDate: '2026-10-04',
  });
  await owner.client.post(`/api/finance/transactions/${voided.body.data.transaction.id}/void`, {});

  const list = await owner.client.get('/api/finance/accounts');
  const byName = new Map(list.body.data.items.map((item) => [item.name, item]));
  // 1000 + 4500 - 120.50 - 500
  assert.equal(byName.get('Bank').balance, '4879.50');
  // 0 + 500
  assert.equal(byName.get('Cash').balance, '500.00');
});
