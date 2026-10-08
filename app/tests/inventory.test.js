import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'inventory.test.local';

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

function utcDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function createUser(label) {
  const client = newClient(baseUrl);
  const { user } = await registerUser(client, { domain: DOMAIN, label });
  return { client, user };
}

async function createHousehold(client, name = 'Inventory Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

async function setup(label) {
  const owner = await createUser(label);
  await createHousehold(owner.client);
  return owner;
}

async function createItem(client, overrides = {}) {
  const response = await client.post('/api/inventory', {
    name: 'Rice',
    quantity: 10,
    unit: 'kg',
    category: 'PANTRY',
    location: 'PANTRY',
    minimumQuantity: 2,
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.item;
}

// ---- Access control ----

test('inventory requires authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/inventory')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/inventory')).status, 403);
});

test('inventory items and transactions are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const item = await createItem(owner.client);

  const stranger = await setup('isolation-b');

  assert.equal((await stranger.client.get(`/api/inventory/${item.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/inventory/${item.id}`, { name: 'X' })).status, 404);
  assert.equal((await stranger.client.del(`/api/inventory/${item.id}`)).status, 404);
  assert.equal((await stranger.client.post(`/api/inventory/${item.id}/consume`, { quantity: 1 })).status, 404);
  assert.equal((await stranger.client.post(`/api/inventory/${item.id}/add-stock`, { quantity: 1 })).status, 404);
  assert.equal((await stranger.client.get(`/api/inventory/${item.id}/transactions`)).status, 404);

  assert.deepEqual((await stranger.client.get('/api/inventory')).body.data.items, []);
});

// ---- Create / read / update / delete ----

test('creating an inventory item normalizes input and records the opening balance', async () => {
  const owner = await setup('create');

  const response = await owner.client.post('/api/inventory', {
    name: '  Basmati Rice  ',
    quantity: 2.5,
    unit: 'kg',
    category: 'PANTRY',
    location: 'PANTRY',
    minimumQuantity: 1,
    expiresAt: utcDate(30),
    notes: '  Airtight jar  ',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const item = response.body.data.item;

  assert.ok(item.id.startsWith('c'));
  assert.equal(item.name, 'Basmati Rice');
  assert.equal(item.quantity, 2.5);
  assert.equal(item.unit, 'kg');
  assert.equal(item.category, 'PANTRY');
  assert.equal(item.location, 'PANTRY');
  assert.equal(item.minimumQuantity, 1);
  assert.equal(item.expiresAt, utcDate(30));
  assert.equal(item.notes, 'Airtight jar');
  assert.equal(item.status, 'IN_STOCK');
  assert.equal(item.expiryStatus, null);

  const transactions = await owner.client.get(`/api/inventory/${item.id}/transactions`);
  assert.equal(transactions.status, 200);
  assert.equal(transactions.body.data.total, 1);
  assert.equal(transactions.body.data.items[0].type, 'PURCHASE');
  assert.equal(transactions.body.data.items[0].quantityDelta, 2.5);
  assert.equal(transactions.body.data.items[0].quantityAfter, 2.5);
  assert.equal(transactions.body.data.items[0].note, 'Initial stock');
  assert.equal(transactions.body.data.items[0].createdBy.name, 'Test User');

  const empty = await owner.client.post('/api/inventory', { name: 'Salt' });
  assert.equal(empty.status, 201);
  assert.equal(empty.body.data.item.quantity, 0);
  assert.equal(empty.body.data.item.unit, null);
  assert.equal(empty.body.data.item.category, 'OTHER');
  assert.equal(empty.body.data.item.location, 'PANTRY');
  assert.equal(empty.body.data.item.minimumQuantity, 0);
  assert.equal(empty.body.data.item.status, 'OUT_OF_STOCK');
  const emptyTransactions = await owner.client.get(`/api/inventory/${empty.body.data.item.id}/transactions`);
  assert.equal(emptyTransactions.body.data.total, 0);
});

test('creating an inventory item validates names, quantities, enums and dates', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ name: '' }, 'name'],
    [{ name: 'Rice', quantity: -1 }, 'quantity'],
    [{ name: 'Rice', minimumQuantity: -1 }, 'minimumQuantity'],
    [{ name: 'Rice', category: 'SNACKS' }, 'category'],
    [{ name: 'Rice', location: 'GARAGE' }, 'location'],
    [{ name: 'Rice', expiresAt: '2026-02-30' }, 'expiresAt'],
  ];
  for (const [payload, field] of cases) {
    const response = await owner.client.post('/api/inventory', payload);
    assert.equal(response.status, 400, JSON.stringify(payload));
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }
});

test('updating inventory metadata works but quantity can only change through transactions', async () => {
  const owner = await setup('update');
  const item = await createItem(owner.client, { name: 'Flour', quantity: 4 });

  const rejected = await owner.client.patch(`/api/inventory/${item.id}`, { quantity: 5 });
  assert.equal(rejected.status, 400);
  assert.ok(rejected.body.error.details.some((detail) => detail.field === 'quantity'));

  const updated = await owner.client.patch(`/api/inventory/${item.id}`, {
    name: '  Wholemeal Flour ',
    minimumQuantity: 3,
    location: 'FREEZER',
    category: 'FROZEN',
    notes: 'Bread stash',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.item.name, 'Wholemeal Flour');
  assert.equal(updated.body.data.item.quantity, 4);
  assert.equal(updated.body.data.item.minimumQuantity, 3);
  assert.equal(updated.body.data.item.location, 'FREEZER');
  assert.equal(updated.body.data.item.category, 'FROZEN');
  assert.equal(updated.body.data.item.notes, 'Bread stash');

  const clearedExpiry = await owner.client.patch(`/api/inventory/${item.id}`, { expiresAt: null });
  assert.equal(clearedExpiry.body.data.item.expiresAt, null);

  const emptyPatch = await owner.client.patch(`/api/inventory/${item.id}`, {});
  assert.equal(emptyPatch.status, 400);

  const deleted = await owner.client.del(`/api/inventory/${item.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: item.id, deleted: true });
  assert.equal((await owner.client.get(`/api/inventory/${item.id}`)).status, 404);
});

// ---- Quantity actions and ledger ----

test('add-stock, consume, waste and adjust update stock and record the ledger', async () => {
  const owner = await setup('actions');
  const item = await createItem(owner.client, { name: 'Oats', quantity: 10, minimumQuantity: 2 });

  const added = await owner.client.post(`/api/inventory/${item.id}/add-stock`, {
    quantity: 5,
    note: 'Bought more',
  });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal(added.body.data.item.quantity, 15);
  assert.equal(added.body.data.transaction.type, 'PURCHASE');
  assert.equal(added.body.data.transaction.quantityDelta, 5);
  assert.equal(added.body.data.transaction.quantityAfter, 15);
  assert.equal(added.body.data.transaction.note, 'Bought more');

  const consumed = await owner.client.post(`/api/inventory/${item.id}/consume`, { quantity: 4 });
  assert.equal(consumed.status, 200);
  assert.equal(consumed.body.data.item.quantity, 11);
  assert.equal(consumed.body.data.transaction.type, 'CONSUME');
  assert.equal(consumed.body.data.transaction.quantityDelta, -4);
  assert.equal(consumed.body.data.transaction.quantityAfter, 11);
  assert.equal(consumed.body.data.item.status, 'IN_STOCK');

  const wasted = await owner.client.post(`/api/inventory/${item.id}/waste`, {
    quantity: 1,
    note: 'Mouldy',
  });
  assert.equal(wasted.status, 200);
  assert.equal(wasted.body.data.item.quantity, 10);
  assert.equal(wasted.body.data.transaction.type, 'WASTE');
  assert.equal(wasted.body.data.transaction.quantityAfter, 10);

  const adjusted = await owner.client.post(`/api/inventory/${item.id}/adjust`, { quantity: 3 });
  assert.equal(adjusted.status, 200);
  assert.equal(adjusted.body.data.item.quantity, 3);
  assert.equal(adjusted.body.data.transaction.type, 'ADJUST');
  assert.equal(adjusted.body.data.transaction.quantityDelta, -7);
  assert.equal(adjusted.body.data.transaction.quantityAfter, 3);

  const history = await owner.client.get(`/api/inventory/${item.id}/transactions`);
  assert.equal(history.status, 200);
  assert.equal(history.body.data.total, 5);
  assert.deepEqual(
    [...new Set(history.body.data.items.map((transaction) => transaction.type))].sort(),
    ['ADJUST', 'CONSUME', 'PURCHASE', 'WASTE'],
  );
  assert.deepEqual(
    history.body.data.items.map((transaction) => transaction.quantityAfter).sort((a, b) => a - b),
    [3, 10, 10, 11, 15],
  );

  const paged = await owner.client.get(`/api/inventory/${item.id}/transactions?limit=2&page=1`);
  assert.equal(paged.body.data.total, 5);
  assert.equal(paged.body.data.totalPages, 3);
  assert.equal(paged.body.data.items.length, 2);
  assert.equal((await owner.client.get(`/api/inventory/${item.id}/transactions?limit=0`)).status, 400);
});

test('stock can never drop below zero', async () => {
  const owner = await setup('negative');
  const item = await createItem(owner.client, { name: 'Honey', quantity: 2, minimumQuantity: 0 });

  const response = await owner.client.post(`/api/inventory/${item.id}/consume`, { quantity: 5 });
  assert.equal(response.status, 400, JSON.stringify(response.body));
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.ok(response.body.error.details.some((detail) => detail.field === 'quantity'));

  const zero = await owner.client.post(`/api/inventory/${item.id}/consume`, { quantity: 0 });
  assert.equal(zero.status, 400);

  const negativeAdjust = await owner.client.post(`/api/inventory/${item.id}/adjust`, { quantity: -1 });
  assert.equal(negativeAdjust.status, 400);

  const fetched = await owner.client.get(`/api/inventory/${item.id}`);
  assert.equal(fetched.body.data.item.quantity, 2);
  const history = await owner.client.get(`/api/inventory/${item.id}/transactions`);
  assert.equal(history.body.data.total, 1);
});

// ---- Derived status, expiry and filters ----

test('stock status is derived from quantity against the minimum threshold', async () => {
  const owner = await setup('statuses');
  const inStock = await createItem(owner.client, { name: 'Pasta', quantity: 5, minimumQuantity: 2 });
  const atMinimum = await createItem(owner.client, { name: 'Tuna', quantity: 2, minimumQuantity: 2 });
  const empty = await createItem(owner.client, { name: 'Sugar', quantity: 0, minimumQuantity: 5 });
  const consumed = await createItem(owner.client, { name: 'Coffee', quantity: 4, minimumQuantity: 3 });

  assert.equal(inStock.status, 'IN_STOCK');
  assert.equal(atMinimum.status, 'LOW_STOCK');
  assert.equal(empty.status, 'OUT_OF_STOCK');

  const inStockList = await owner.client.get('/api/inventory?stock=in_stock');
  assert.deepEqual(inStockList.body.data.items.map((item) => item.name), ['Coffee', 'Pasta']);

  const lowList = await owner.client.get('/api/inventory?stock=low_stock');
  assert.deepEqual(lowList.body.data.items.map((item) => item.name), ['Tuna']);

  const outList = await owner.client.get('/api/inventory?stock=out_of_stock');
  assert.deepEqual(outList.body.data.items.map((item) => item.name), ['Sugar']);

  const consumedResponse = await owner.client.post(`/api/inventory/${consumed.id}/consume`, {
    quantity: 1,
  });
  assert.equal(consumedResponse.body.data.item.status, 'LOW_STOCK');
  const goneResponse = await owner.client.post(`/api/inventory/${consumed.id}/consume`, {
    quantity: 3,
  });
  assert.equal(goneResponse.body.data.item.status, 'OUT_OF_STOCK');

  const invalid = await owner.client.get('/api/inventory?stock=empty');
  assert.equal(invalid.status, 400);
});

test('expiry status and filters use the seven day horizon', async () => {
  const owner = await setup('expiry');
  const expired = await createItem(owner.client, { name: 'Old Yogurt', quantity: 1, expiresAt: utcDate(-1) });
  const today = await createItem(owner.client, { name: 'Fresh Cream', quantity: 1, expiresAt: utcDate(0) });
  const soon = await createItem(owner.client, { name: 'Cheese', quantity: 1, expiresAt: utcDate(3) });
  const later = await createItem(owner.client, { name: 'Jam', quantity: 1, expiresAt: utcDate(10) });
  const never = await createItem(owner.client, { name: 'Salt', quantity: 1 });

  assert.equal(expired.expiryStatus, 'EXPIRED');
  assert.equal(today.expiryStatus, 'EXPIRING_SOON');
  assert.equal(soon.expiryStatus, 'EXPIRING_SOON');
  assert.equal(later.expiryStatus, null);
  assert.equal(never.expiryStatus, null);

  const expiredList = await owner.client.get('/api/inventory?expiry=expired');
  assert.deepEqual(expiredList.body.data.items.map((item) => item.name), ['Old Yogurt']);

  const soonList = await owner.client.get('/api/inventory?expiry=expiring_soon');
  assert.deepEqual(soonList.body.data.items.map((item) => item.name).sort(), ['Cheese', 'Fresh Cream']);

  const noneList = await owner.client.get('/api/inventory?expiry=none');
  assert.deepEqual(noneList.body.data.items.map((item) => item.name), ['Salt']);

  const invalid = await owner.client.get('/api/inventory?expiry=soonish');
  assert.equal(invalid.status, 400);
});

test('inventory can be searched and filtered by category and location', async () => {
  const owner = await setup('filters');
  await createItem(owner.client, { name: 'Chicken Breast', category: 'MEAT', location: 'FREEZER' });
  await createItem(owner.client, { name: 'Cheddar', category: 'DAIRY', location: 'REFRIGERATOR' });
  await createItem(owner.client, { name: 'Chicken Stock', category: 'PANTRY', location: 'PANTRY' });

  const searched = await owner.client.get('/api/inventory?search=chicken');
  assert.deepEqual(
    searched.body.data.items.map((item) => item.name).sort(),
    ['Chicken Breast', 'Chicken Stock'],
  );

  const byCategory = await owner.client.get('/api/inventory?category=DAIRY');
  assert.deepEqual(byCategory.body.data.items.map((item) => item.name), ['Cheddar']);

  const byLocation = await owner.client.get('/api/inventory?location=FREEZER');
  assert.deepEqual(byLocation.body.data.items.map((item) => item.name), ['Chicken Breast']);

  const paged = await owner.client.get('/api/inventory?limit=2&page=2');
  assert.equal(paged.body.data.total, 3);
  assert.equal(paged.body.data.totalPages, 2);
  assert.equal(paged.body.data.items.length, 1);

  const invalid = await owner.client.get('/api/inventory?category=SNACKS');
  assert.equal(invalid.status, 400);
});
