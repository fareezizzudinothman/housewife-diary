import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-bills.test.local';

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
  const response = await owner.client.post('/api/households', { name: 'Bill Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createBill(client, overrides = {}) {
  const response = await client.post('/api/finance/bills', {
    name: 'Electricity',
    amount: '180.00',
    currency: 'SGD',
    dueDate: dateOffset(5),
    categoryId: 'fcat-exp-utilities',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.bill;
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

test('finance bills require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/bills')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/bills')).status, 403);
});

test('bills are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const bill = await createBill(owner.client);

  const stranger = await setup('isolation-b');
  assert.equal((await stranger.client.get(`/api/finance/bills/${bill.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/finance/bills/${bill.id}`, { amount: '1.00' })).status, 404);
  assert.equal((await stranger.client.post(`/api/finance/bills/${bill.id}/pay`, {})).status, 404);
  assert.equal((await stranger.client.post(`/api/finance/bills/${bill.id}/cancel`, {})).status, 404);
  assert.deepEqual((await stranger.client.get('/api/finance/bills')).body.data.items, []);
});

test('bill status is derived from the due date until it is paid or cancelled', async () => {
  const owner = await setup('status');

  const due = await createBill(owner.client, { name: 'Due today', dueDate: dateOffset(0) });
  const overdue = await createBill(owner.client, { name: 'Overdue', dueDate: dateOffset(-1) });
  const upcoming = await createBill(owner.client, { name: 'Upcoming', dueDate: dateOffset(5) });

  assert.equal(due.status, 'DUE');
  assert.equal(due.storedStatus, 'UPCOMING');
  assert.equal(overdue.status, 'OVERDUE');
  assert.equal(upcoming.status, 'UPCOMING');

  const all = await owner.client.get('/api/finance/bills');
  assert.equal(all.body.data.total, 3);

  const overdueList = await owner.client.get('/api/finance/bills?status=OVERDUE');
  assert.deepEqual(overdueList.body.data.items.map((item) => item.name), ['Overdue']);

  const dueList = await owner.client.get('/api/finance/bills?status=DUE');
  assert.deepEqual(dueList.body.data.items.map((item) => item.name), ['Due today']);

  const upcomingList = await owner.client.get('/api/finance/bills?status=UPCOMING');
  assert.deepEqual(upcomingList.body.data.items.map((item) => item.name), ['Upcoming']);

  const search = await owner.client.get('/api/finance/bills?search=upcom');
  assert.deepEqual(search.body.data.items.map((item) => item.name), ['Upcoming']);
});

test('bill creation validates name, amount, dates, category and account currency', async () => {
  const owner = await setup('validate');
  const usd = await createAccount(owner.client, { name: 'USD account', currency: 'USD' });

  const cases = [
    [{ name: '' }, 'name'],
    [{ amount: '0' }, 'amount'],
    [{ amount: '-1.00' }, 'amount'],
    [{ amount: '1.005' }, 'amount'],
    [{ dueDate: '2026-02-30' }, 'dueDate'],
    [{ dueDate: '' }, 'dueDate'],
    [{ categoryId: null }, 'categoryId'],
    [{ categoryId: 'fcat-inc-salary' }, 'categoryId'],
    [{ currency: 'XYZ' }, 'currency'],
    [{ accountId: usd.id }, 'accountId'],
  ];
  for (const [overrides, field] of cases) {
    const response = await owner.client.post('/api/finance/bills', {
      name: 'Water',
      amount: '50.00',
      currency: 'SGD',
      dueDate: dateOffset(3),
      categoryId: 'fcat-exp-utilities',
      ...overrides,
    });
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(overrides)}`);
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }
});

test('unpaid bills can be edited; identity and status changes go through the proper endpoints', async () => {
  const owner = await setup('update');
  const bill = await createBill(owner.client);

  const updated = await owner.client.patch(`/api/finance/bills/${bill.id}`, {
    name: 'Electricity October',
    amount: '190.00',
    dueDate: dateOffset(7),
    notes: 'Check meter reading',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.bill.name, 'Electricity October');
  assert.equal(updated.body.data.bill.amount, '190.00');
  assert.equal(updated.body.data.bill.dueDate, dateOffset(7));
  assert.equal(updated.body.data.bill.notes, 'Check meter reading');

  const statusPatch = await owner.client.patch(`/api/finance/bills/${bill.id}`, {
    status: 'PAID',
  });
  assert.equal(statusPatch.status, 400);
  assert.ok(statusPatch.body.error.details.some((detail) => detail.field === 'status'));

  const empty = await owner.client.patch(`/api/finance/bills/${bill.id}`, {});
  assert.equal(empty.status, 400);
});

test('paying a bill creates the linked expense and never double counts', async () => {
  const owner = await setup('pay');
  const account = await createAccount(owner.client, { name: 'DBS' });
  const bill = await createBill(owner.client, { accountId: account.id, categoryId: 'fcat-exp-utilities' });

  const paid = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {
    transactionDate: '2026-10-08',
    merchant: 'SP Services',
  });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  assert.equal(paid.body.data.bill.status, 'PAID');
  assert.equal(paid.body.data.bill.storedStatus, 'PAID');
  assert.ok(paid.body.data.bill.paidAt);
  assert.equal(paid.body.data.bill.paidTransactionId, paid.body.data.transaction.id);
  assert.equal(paid.body.data.transaction.amount, '180.00');
  assert.equal(paid.body.data.transaction.currency, 'SGD');

  const transaction = await owner.client.get(
    `/api/finance/transactions/${paid.body.data.transaction.id}`,
  );
  assert.equal(transaction.body.data.transaction.sourceType, 'BILL');
  assert.equal(transaction.body.data.transaction.sourceId, bill.id);
  assert.equal(transaction.body.data.transaction.category.name, 'Utilities');
  assert.equal(transaction.body.data.transaction.account.id, account.id);
  assert.equal(transaction.body.data.transaction.merchant, 'SP Services');

  // A second payment is refused and no second expense exists.
  const again = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {});
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'CONFLICT');

  const transactions = await owner.client.get(
    `/api/finance/transactions?sourceType=BILL&status=ALL`,
  );
  assert.equal(transactions.body.data.total, 1);

  // A paid bill cannot be edited or cancelled.
  assert.equal(
    (await owner.client.patch(`/api/finance/bills/${bill.id}`, { amount: '1.00' })).status,
    409,
  );
  assert.equal((await owner.client.post(`/api/finance/bills/${bill.id}/cancel`, {})).status, 409);
});

test('paying a bill can override the amount, date and account within the bill currency', async () => {
  const owner = await setup('pay-options');
  const usd = await createAccount(owner.client, { name: 'USD', currency: 'USD' });
  const bill = await createBill(owner.client);

  const wrongAccount = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {
    accountId: usd.id,
  });
  assert.equal(wrongAccount.status, 400);
  assert.ok(wrongAccount.body.error.details.some((detail) => detail.field === 'accountId'));

  const paid = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {
    amount: '175.50',
    transactionDate: '2026-10-09',
  });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  assert.equal(paid.body.data.transaction.amount, '175.50');

  const transaction = await owner.client.get(
    `/api/finance/transactions/${paid.body.data.transaction.id}`,
  );
  assert.equal(transaction.body.data.transaction.transactionDate, '2026-10-09');
});

test('cancelling an unpaid bill keeps it out of the active list and is final', async () => {
  const owner = await setup('cancel');
  const bill = await createBill(owner.client);

  const cancelled = await owner.client.post(`/api/finance/bills/${bill.id}/cancel`, {});
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.data.bill.status, 'CANCELLED');
  assert.ok(cancelled.body.data.bill.cancelledAt);

  const again = await owner.client.post(`/api/finance/bills/${bill.id}/cancel`, {});
  assert.equal(again.status, 409);

  const pay = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {});
  assert.equal(pay.status, 409);

  const cancelledList = await owner.client.get('/api/finance/bills?status=CANCELLED');
  assert.equal(cancelledList.body.data.total, 1);
});

test('unpaid bills appear on the calendar as derived BILL items', async () => {
  const owner = await setup('calendar');
  const bill = await createBill(owner.client, { name: 'Internet', dueDate: dateOffset(3) });
  const paid = await createBill(owner.client, { name: 'Paid bill', dueDate: dateOffset(4) });
  assert.equal(
    (await owner.client.post(`/api/finance/bills/${paid.id}/pay`, {})).status,
    201,
  );
  const cancelled = await createBill(owner.client, { name: 'Cancelled bill', dueDate: dateOffset(5) });
  assert.equal(
    (await owner.client.post(`/api/finance/bills/${cancelled.id}/cancel`, {})).status,
    200,
  );

  const from = dateOffset(1);
  const to = dateOffset(7);
  const calendar = await owner.client.get(`/api/calendar?from=${from}&to=${to}`);
  assert.equal(calendar.status, 200, JSON.stringify(calendar.body));

  const billItems = calendar.body.data.events.filter((event) => event.sourceType === 'BILL');
  assert.deepEqual(
    billItems.map((event) => event.title),
    ['Internet'],
  );
  assert.equal(billItems[0].id, `bill:${bill.id}`);
  assert.equal(billItems[0].sourceId, bill.id);
  assert.equal(billItems[0].allDay, true);
  assert.equal(billItems[0].bill.amount, '180.00');
  assert.equal(billItems[0].bill.dueDate, dateOffset(3));
  assert.ok(['UPCOMING', 'DUE', 'OVERDUE'].includes(billItems[0].bill.status));

  // Derived bill ids are read-only: they never resolve as calendar events.
  assert.equal((await owner.client.get(`/api/calendar/bill:${bill.id}`)).status, 404);

  // Another household never sees the bill.
  const stranger = await setup('calendar-other');
  const otherCalendar = await stranger.client.get(`/api/calendar?from=${from}&to=${to}`);
  assert.deepEqual(
    otherCalendar.body.data.events.filter((event) => event.sourceType === 'BILL'),
    [],
  );
});

test('voiding a bill payment reopens the bill so it can be paid again', async () => {
  const owner = await setup('void-reopen');
  const bill = await createBill(owner.client);

  const paid = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {});
  assert.equal(paid.status, 201);
  const transactionId = paid.body.data.transaction.id;

  const voided = await owner.client.post(`/api/finance/transactions/${transactionId}/void`, {
    reason: 'Wrong bill',
  });
  assert.equal(voided.status, 200);

  const reopened = await owner.client.get(`/api/finance/bills/${bill.id}`);
  assert.equal(reopened.body.data.bill.status, 'UPCOMING');
  assert.equal(reopened.body.data.bill.storedStatus, 'UPCOMING');
  assert.equal(reopened.body.data.bill.paidAt, null);
  assert.equal(reopened.body.data.bill.paidTransactionId, null);

  const paidAgain = await owner.client.post(`/api/finance/bills/${bill.id}/pay`, {});
  assert.equal(paidAgain.status, 201, JSON.stringify(paidAgain.body));
  assert.notEqual(paidAgain.body.data.transaction.id, transactionId);

  // Both payments are visible in history; only the new one counts as posted.
  const posted = await owner.client.get('/api/finance/transactions?sourceType=BILL');
  assert.equal(posted.body.data.total, 1);
  const all = await owner.client.get('/api/finance/transactions?sourceType=BILL&status=ALL');
  assert.equal(all.body.data.total, 2);
});
