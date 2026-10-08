import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-categories.test.local';

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
  const response = await owner.client.post('/api/households', { name: 'Category Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createCategory(client, overrides = {}) {
  const response = await client.post('/api/finance/categories', {
    name: 'Kids activities',
    type: 'EXPENSE',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.category;
}

test('finance categories require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/categories')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/categories')).status, 403);
});

test('the catalog lists seeded global categories plus household ones', async () => {
  const owner = await setup('catalog');

  const globals = await owner.client.get('/api/finance/categories');
  assert.equal(globals.status, 200);
  const globalNames = globals.body.data.items.map((item) => item.name);
  assert.ok(globalNames.includes('Salary'));
  assert.ok(globalNames.includes('Groceries'));
  assert.ok(globalNames.every((name) => name !== 'Kids activities'));
  assert.ok(globals.body.data.items.every((item) => item.scope === 'GLOBAL'));
  assert.equal(globals.body.data.items.find((item) => item.name === 'Groceries').transactionCount, 0);

  await createCategory(owner.client, { name: 'Kids activities' });
  const withHousehold = await owner.client.get('/api/finance/categories?type=EXPENSE');
  const household = withHousehold.body.data.items.find((item) => item.name === 'Kids activities');
  assert.equal(household.scope, 'HOUSEHOLD');
  assert.equal(household.owned, true);

  const income = await owner.client.get('/api/finance/categories?type=INCOME');
  assert.ok(income.body.data.items.every((item) => item.type === 'INCOME'));
});

test('household categories are created, updated and archived', async () => {
  const owner = await setup('crud');

  const category = await createCategory(owner.client, {
    name: '  Kids activities  ',
    icon: 'star',
    sortOrder: 3,
  });
  assert.equal(category.name, 'Kids activities');
  assert.equal(category.icon, 'star');
  assert.equal(category.sortOrder, 3);
  assert.equal(category.active, true);
  assert.equal(category.scope, 'HOUSEHOLD');

  const updated = await owner.client.patch(`/api/finance/categories/${category.id}`, {
    name: 'Children activities',
    icon: 'users',
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.category.name, 'Children activities');
  assert.equal(updated.body.data.category.icon, 'users');

  const empty = await owner.client.patch(`/api/finance/categories/${category.id}`, {});
  assert.equal(empty.status, 400);

  const archived = await owner.client.post(
    `/api/finance/categories/${category.id}/archive`,
    {},
  );
  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.category.active, false);

  const defaultList = await owner.client.get('/api/finance/categories?type=EXPENSE');
  assert.ok(defaultList.body.data.items.every((item) => item.name !== 'Children activities'));

  const all = await owner.client.get('/api/finance/categories?type=EXPENSE&includeArchived=true');
  assert.ok(all.body.data.items.some((item) => item.name === 'Children activities'));
});

test('category creation validates name, type and metadata', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ name: '' }, 'name'],
    [{ name: 'x'.repeat(81) }, 'name'],
    [{ type: 'TRANSFER' }, 'type'],
    [{ type: null }, 'type'],
    [{ icon: 'x'.repeat(41) }, 'icon'],
    [{ sortOrder: -1 }, 'sortOrder'],
  ];
  for (const [overrides, field] of cases) {
    const response = await owner.client.post('/api/finance/categories', {
      name: 'Hobby',
      type: 'EXPENSE',
      ...overrides,
    });
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(overrides)}`);
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }

  const duplicate = await owner.client.post('/api/finance/categories', {
    name: 'Hobby',
    type: 'EXPENSE',
  });
  assert.equal(duplicate.status, 201);

  const sameNameOtherType = await owner.client.post('/api/finance/categories', {
    name: 'Hobby',
    type: 'INCOME',
  });
  assert.equal(sameNameOtherType.status, 201, 'the same name is allowed for the other type');

  const conflict = await owner.client.post('/api/finance/categories', {
    name: 'hobby',
    type: 'EXPENSE',
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'CONFLICT');
});

test('global categories are read-only and household categories stay isolated', async () => {
  const owner = await setup('isolation-a');
  const category = await createCategory(owner.client);

  const globalUpdate = await owner.client.patch('/api/finance/categories/fcat-exp-other', {
    name: 'Renamed',
  });
  assert.equal(globalUpdate.status, 403);
  assert.equal(globalUpdate.body.error.code, 'FORBIDDEN');
  const globalArchive = await owner.client.post(
    '/api/finance/categories/fcat-exp-other/archive',
    {},
  );
  assert.equal(globalArchive.status, 403);

  const stranger = await setup('isolation-b');
  const strangerList = await stranger.client.get('/api/finance/categories?includeArchived=true');
  assert.ok(strangerList.body.data.items.every((item) => item.name !== 'Kids activities'));
  assert.equal(
    (await stranger.client.patch(`/api/finance/categories/${category.id}`, { name: 'X' })).status,
    404,
  );
  assert.equal(
    (await stranger.client.post(`/api/finance/categories/${category.id}/archive`, {})).status,
    404,
  );
});
