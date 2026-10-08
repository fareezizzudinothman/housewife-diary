import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'shopping.test.local';

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

async function createHousehold(client, name = 'Shopping Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

async function setup(label) {
  const owner = await createUser(label);
  await createHousehold(owner.client);
  return owner;
}

async function createList(client, overrides = {}) {
  const response = await client.post('/api/shopping-lists', { name: 'Weekly Shop', ...overrides });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.list;
}

async function createItem(client, listId, overrides = {}) {
  const response = await client.post(`/api/shopping-lists/${listId}/items`, {
    name: 'Milk',
    quantity: 2,
    unit: 'litres',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.item;
}

async function createRecipe(client, overrides = {}) {
  const response = await client.post('/api/recipes', {
    title: 'Pancakes',
    servings: 2,
    ingredients: [
      { name: 'Flour', quantity: 200, unit: 'g' },
      { name: 'Milk', quantity: 300, unit: 'ml' },
    ],
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.recipe;
}

async function createMeal(client, overrides = {}) {
  const response = await client.post('/api/meals', {
    date: '2026-11-02',
    mealType: 'DINNER',
    title: 'Meal',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.meal;
}

// ---- Access control ----

test('shopping lists require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/shopping-lists')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/shopping-lists')).status, 403);
});

test('shopping data is isolated per household', async () => {
  const owner = await setup('isolation-a');
  const list = await createList(owner.client);
  const item = await createItem(owner.client, list.id);
  const recipe = await createRecipe(owner.client);

  const stranger = await setup('isolation-b');

  assert.equal((await stranger.client.get(`/api/shopping-lists/${list.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/shopping-lists/${list.id}`, { name: 'X' })).status, 404);
  assert.equal((await stranger.client.del(`/api/shopping-lists/${list.id}`)).status, 404);
  assert.equal((await stranger.client.get(`/api/shopping-lists/${list.id}/items`)).status, 404);
  assert.equal(
    (await stranger.client.post(`/api/shopping-lists/${list.id}/items`, { name: 'Nope' })).status,
    404,
  );
  assert.equal(
    (await stranger.client.post(`/api/shopping-lists/${list.id}/from-recipe/${recipe.id}`, {})).status,
    404,
  );
  assert.equal(
    (await stranger.client.post(`/api/shopping-lists/${list.id}/items/${item.id}/to-inventory`, {})).status,
    404,
  );

  assert.deepEqual((await stranger.client.get('/api/shopping-lists')).body.data.items, []);
});

// ---- Lists ----

test('creating, reading, updating and deleting a shopping list', async () => {
  const owner = await setup('list-crud');

  const response = await owner.client.post('/api/shopping-lists', {
    name: '  Weekend market  ',
    notes: '  Bring the big bag  ',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const list = response.body.data.list;
  assert.ok(list.id.startsWith('c'));
  assert.equal(list.name, 'Weekend market');
  assert.equal(list.notes, 'Bring the big bag');
  assert.equal(list.archived, false);
  assert.equal(list.archivedAt, null);
  assert.equal(list.itemCount, 0);
  assert.equal(list.remaining, 0);

  const fetched = await owner.client.get(`/api/shopping-lists/${list.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.list.name, 'Weekend market');

  const updated = await owner.client.patch(`/api/shopping-lists/${list.id}`, {
    name: 'Farmers market',
    notes: null,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.list.name, 'Farmers market');
  assert.equal(updated.body.data.list.notes, null);

  const archived = await owner.client.patch(`/api/shopping-lists/${list.id}`, { archived: true });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.list.archived, true);
  assert.ok(archived.body.data.list.archivedAt);

  const restored = await owner.client.patch(`/api/shopping-lists/${list.id}`, { archived: false });
  assert.equal(restored.body.data.list.archived, false);
  assert.equal(restored.body.data.list.archivedAt, null);

  const emptyPatch = await owner.client.patch(`/api/shopping-lists/${list.id}`, {});
  assert.equal(emptyPatch.status, 400);

  const deleted = await owner.client.del(`/api/shopping-lists/${list.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: list.id, deleted: true });
  assert.equal((await owner.client.get(`/api/shopping-lists/${list.id}`)).status, 404);

  const missing = await owner.client.post('/api/shopping-lists', { name: '' });
  assert.equal(missing.status, 400);
});

test('listing shopping lists filters archived state and searches by name', async () => {
  const owner = await setup('list-filters');
  const weekly = await createList(owner.client, { name: 'Weekly Groceries' });
  const party = await createList(owner.client, { name: 'Birthday Party' });
  await owner.client.patch(`/api/shopping-lists/${party.id}`, { archived: true });

  const active = await owner.client.get('/api/shopping-lists');
  assert.equal(active.status, 200);
  assert.deepEqual(active.body.data.items.map((list) => list.name), ['Weekly Groceries']);
  assert.equal(active.body.data.total, 1);

  const archived = await owner.client.get('/api/shopping-lists?archived=true');
  assert.deepEqual(archived.body.data.items.map((list) => list.name), ['Birthday Party']);

  const searched = await owner.client.get('/api/shopping-lists?search=party');
  assert.equal(searched.status, 200);
  assert.deepEqual(searched.body.data.items, []);

  const activeSearch = await owner.client.get('/api/shopping-lists?search=groceries');
  assert.deepEqual(activeSearch.body.data.items.map((list) => list.name), ['Weekly Groceries']);

  const invalid = await owner.client.get('/api/shopping-lists?page=0');
  assert.equal(invalid.status, 400);

  assert.ok(weekly.id);
});

// ---- Items ----

test('creating shopping items validates and normalizes input', async () => {
  const owner = await setup('item-create');
  const list = await createList(owner.client);

  const response = await owner.client.post(`/api/shopping-lists/${list.id}/items`, {
    name: '  Oat Milk  ',
    quantity: 1.5,
    unit: 'cartons',
    category: 'DAIRY',
    notes: 'Unsweetened',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const item = response.body.data.item;
  assert.equal(item.name, 'Oat Milk');
  assert.equal(item.quantity, 1.5);
  assert.equal(item.unit, 'cartons');
  assert.equal(item.category, 'DAIRY');
  assert.equal(item.notes, 'Unsweetened');
  assert.equal(item.purchased, false);
  assert.equal(item.purchasedAt, null);
  assert.equal(item.recipe, null);

  const bare = await owner.client.post(`/api/shopping-lists/${list.id}/items`, { name: 'Bread' });
  assert.equal(bare.status, 201);
  assert.equal(bare.body.data.item.quantity, null);
  assert.equal(bare.body.data.item.unit, null);
  assert.equal(bare.body.data.item.category, 'OTHER');

  const cases = [
    [ { name: '' }, 'name' ],
    [ { name: 'x'.repeat(121) }, 'name' ],
    [ { name: 'Rice', quantity: 0 }, 'quantity' ],
    [ { name: 'Rice', quantity: -1 }, 'quantity' ],
    [ { name: 'Rice', category: 'SNACKS' }, 'category' ],
  ];
  for (const [payload, field] of cases) {
    const bad = await owner.client.post(`/api/shopping-lists/${list.id}/items`, payload);
    assert.equal(bad.status, 400, JSON.stringify(payload));
    assert.ok(
      bad.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(bad.body.error.details)}`,
    );
  }

  const listAfter = await owner.client.get(`/api/shopping-lists/${list.id}`);
  assert.equal(listAfter.body.data.list.itemCount, 2);
  assert.equal(listAfter.body.data.list.remaining, 2);
});

test('listing, filtering, updating and deleting shopping items', async () => {
  const owner = await setup('item-crud');
  const list = await createList(owner.client);
  const milk = await createItem(owner.client, list.id, { name: 'Milk', category: 'DAIRY' });
  await createItem(owner.client, list.id, { name: 'Apples', category: 'PRODUCE', quantity: 6 });
  await createItem(owner.client, list.id, { name: 'Bleach', category: 'HOUSEHOLD', quantity: null, unit: null });

  const all = await owner.client.get(`/api/shopping-lists/${list.id}/items`);
  assert.equal(all.status, 200);
  assert.equal(all.body.data.total, 3);
  assert.equal(all.body.data.list.itemCount, 3);

  const produce = await owner.client.get(`/api/shopping-lists/${list.id}/items?category=PRODUCE`);
  assert.deepEqual(produce.body.data.items.map((item) => item.name), ['Apples']);

  const searched = await owner.client.get(`/api/shopping-lists/${list.id}/items?search=bl`);
  assert.deepEqual(searched.body.data.items.map((item) => item.name), ['Bleach']);

  assert.equal((await owner.client.get(`/api/shopping-lists/${list.id}/items?category=NOPE`)).status, 400);

  const updated = await owner.client.patch(`/api/shopping-lists/${list.id}/items/${milk.id}`, {
    name: 'Oat Milk',
    quantity: 3,
    unit: 'cartons',
    category: 'DAIRY',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.item.name, 'Oat Milk');
  assert.equal(updated.body.data.item.quantity, 3);
  assert.equal(updated.body.data.item.unit, 'cartons');

  const noop = await owner.client.patch(`/api/shopping-lists/${list.id}/items/${milk.id}`, {});
  assert.equal(noop.status, 400);

  const missing = await owner.client.patch(
    `/api/shopping-lists/${list.id}/items/cmissing00000000000000000`,
    { quantity: 1 },
  );
  assert.equal(missing.status, 404);

  const deleted = await owner.client.del(`/api/shopping-lists/${list.id}/items/${milk.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: milk.id, deleted: true });

  const after = await owner.client.get(`/api/shopping-lists/${list.id}/items`);
  assert.equal(after.body.data.total, 2);
});

test('purchasing and unpurchasing items updates remaining counts and filters', async () => {
  const owner = await setup('purchase');
  const list = await createList(owner.client);
  const milk = await createItem(owner.client, list.id, { name: 'Milk' });
  await createItem(owner.client, list.id, { name: 'Eggs', quantity: 12 });

  const purchased = await owner.client.patch(
    `/api/shopping-lists/${list.id}/items/${milk.id}`,
    { purchased: true },
  );
  assert.equal(purchased.status, 200);
  assert.equal(purchased.body.data.item.purchased, true);
  assert.ok(purchased.body.data.item.purchasedAt);

  const listView = await owner.client.get(`/api/shopping-lists/${list.id}`);
  assert.equal(listView.body.data.list.remaining, 1);

  const remaining = await owner.client.get(`/api/shopping-lists/${list.id}/items?purchased=false`);
  assert.deepEqual(remaining.body.data.items.map((item) => item.name), ['Eggs']);
  const bought = await owner.client.get(`/api/shopping-lists/${list.id}/items?purchased=true`);
  assert.deepEqual(bought.body.data.items.map((item) => item.name), ['Milk']);

  const unpurchased = await owner.client.patch(
    `/api/shopping-lists/${list.id}/items/${milk.id}`,
    { purchased: false },
  );
  assert.equal(unpurchased.status, 200);
  assert.equal(unpurchased.body.data.item.purchased, false);
  assert.equal(unpurchased.body.data.item.purchasedAt, null);
  assert.equal((await owner.client.get(`/api/shopping-lists/${list.id}`)).body.data.list.remaining, 2);
});

// ---- Recipe -> shopping ----

test('adding a recipe to a shopping list scales servings and merges matching lines', async () => {
  const owner = await setup('from-recipe');
  const list = await createList(owner.client);
  const recipe = await createRecipe(owner.client);

  const scaled = await owner.client.post(
    `/api/shopping-lists/${list.id}/from-recipe/${recipe.id}`,
    { servings: 4 },
  );
  assert.equal(scaled.status, 201, JSON.stringify(scaled.body));
  assert.equal(scaled.body.data.added, 2);
  assert.equal(scaled.body.data.merged, 0);
  assert.deepEqual(
    scaled.body.data.items.map((item) => [item.name, item.quantity, item.unit]),
    [
      ['Flour', 400, 'g'],
      ['Milk', 600, 'ml'],
    ],
  );
  assert.equal(scaled.body.data.list.remaining, 2);

  // Adding again at the original serving count sums into the open lines.
  const merged = await owner.client.post(
    `/api/shopping-lists/${list.id}/from-recipe/${recipe.id}`,
    { servings: 2 },
  );
  assert.equal(merged.status, 201, JSON.stringify(merged.body));
  assert.equal(merged.body.data.added, 0);
  assert.equal(merged.body.data.merged, 2);
  assert.deepEqual(
    merged.body.data.items.map((item) => [item.name, item.quantity]),
    [
      ['Flour', 600],
      ['Milk', 900],
    ],
  );

  // Matching is case-insensitive on name and unit.
  const casingList = await createList(owner.client, { name: 'Casing' });
  await createItem(owner.client, casingList.id, { name: 'flour', quantity: 100, unit: 'g' });
  const caseMerged = await owner.client.post(
    `/api/shopping-lists/${casingList.id}/from-recipe/${recipe.id}`,
    { servings: 2 },
  );
  assert.equal(caseMerged.body.data.merged, 1);
  assert.equal(caseMerged.body.data.added, 1);
  const casingItems = await owner.client.get(`/api/shopping-lists/${casingList.id}/items`);
  assert.deepEqual(
    casingItems.body.data.items.map((item) => [item.name, item.quantity]),
    [
      ['flour', 300],
      ['Milk', 300],
    ],
  );

  const missingRecipe = await owner.client.post(
    `/api/shopping-lists/${list.id}/from-recipe/cmissing00000000000000000`,
    {},
  );
  assert.equal(missingRecipe.status, 404);

  const badServings = await owner.client.post(
    `/api/shopping-lists/${list.id}/from-recipe/${recipe.id}`,
    { servings: 0 },
  );
  assert.equal(badServings.status, 400);
});

test('ingredients with a different unit stay on separate lines and purchased lines never merge', async () => {
  const owner = await setup('merge-rules');
  const list = await createList(owner.client);
  const recipe = await createRecipe(owner.client, {
    title: 'Butter Toast',
    servings: 1,
    ingredients: [{ name: 'Butter', quantity: 20, unit: 'g' }],
  });

  await createItem(owner.client, list.id, { name: 'Butter', quantity: 1, unit: 'cup' });
  const added = await owner.client.post(
    `/api/shopping-lists/${list.id}/from-recipe/${recipe.id}`,
    {},
  );
  assert.equal(added.status, 201, JSON.stringify(added.body));
  assert.equal(added.body.data.added, 1);
  assert.equal(added.body.data.merged, 0);
  assert.deepEqual(
    added.body.data.items.map((item) => [item.name, item.unit, item.quantity]),
    [['Butter', 'g', 20]],
  );
  const lines = await owner.client.get(`/api/shopping-lists/${list.id}/items`);
  assert.deepEqual(
    lines.body.data.items.map((item) => [item.name, item.unit, item.quantity]),
    [
      ['Butter', 'cup', 1],
      ['Butter', 'g', 20],
    ],
  );

  // Purchased lines are closed: a new line is created instead of reopening them.
  const brittle = await owner.client.get(`/api/shopping-lists/${list.id}/items`);
  const gramLine = brittle.body.data.items.find((item) => item.unit === 'g');
  await owner.client.patch(`/api/shopping-lists/${list.id}/items/${gramLine.id}`, {
    purchased: true,
  });

  const again = await owner.client.post(`/api/shopping-lists/${list.id}/from-recipe/${recipe.id}`, {});
  assert.equal(again.body.data.added, 1);
  assert.equal(again.body.data.merged, 0);

  const finalItems = await owner.client.get(`/api/shopping-lists/${list.id}/items`);
  const gramLines = finalItems.body.data.items.filter((item) => item.unit === 'g');
  assert.equal(gramLines.length, 2);
  assert.deepEqual(gramLines.map((item) => item.purchased).sort(), [false, true]);
});

// ---- Meal plan -> shopping ----

test('the meals shopping-plan preview aggregates recipe ingredients across planned meals', async () => {
  const owner = await setup('meal-preview');
  const recipe = await createRecipe(owner.client, {
    title: 'Rice Bowl',
    servings: 2,
    ingredients: [
      { name: 'Rice', quantity: 100, unit: 'g' },
      { name: 'Beans', quantity: 1, unit: 'can' },
    ],
  });
  await createMeal(owner.client, { date: '2026-11-02', mealType: 'DINNER', title: null, recipeId: recipe.id });
  await createMeal(owner.client, { date: '2026-11-03', mealType: 'LUNCH', title: null, recipeId: recipe.id });
  await createMeal(owner.client, { date: '2026-11-02', mealType: 'BREAKFAST', title: 'Toast' });

  const preview = await owner.client.get(
    '/api/meals/shopping-plan?from=2026-11-01&to=2026-11-07',
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.data.from, '2026-11-01');
  assert.equal(preview.body.data.to, '2026-11-07');
  assert.deepEqual(
    preview.body.data.items.map((item) => [item.name, item.quantity, item.unit]),
    [
      ['Beans', 2, 'can'],
      ['Rice', 200, 'g'],
    ],
  );
  const rice = preview.body.data.items.find((item) => item.name === 'Rice');
  assert.deepEqual(
    rice.sources.map((source) => [source.date, source.mealType, source.recipe]),
    [
      ['2026-11-02', 'DINNER', 'Rice Bowl'],
      ['2026-11-03', 'LUNCH', 'Rice Bowl'],
    ],
  );

  const anonymous = newClient(baseUrl);
  assert.equal(
    (await anonymous.get('/api/meals/shopping-plan?from=2026-11-01&to=2026-11-07')).status,
    401,
  );
  const badRange = await owner.client.get('/api/meals/shopping-plan?to=2026-11-01&from=2026-11-07');
  assert.equal(badRange.status, 400);
});

test('committing a meal plan to a shopping list uses the live plan or a reviewed selection', async () => {
  const owner = await setup('meal-commit');
  const recipe = await createRecipe(owner.client, {
    title: 'Rice Bowl',
    servings: 2,
    ingredients: [
      { name: 'Rice', quantity: 100, unit: 'g' },
      { name: 'Beans', quantity: 1, unit: 'can' },
    ],
  });
  await createMeal(owner.client, { date: '2026-11-02', mealType: 'DINNER', title: null, recipeId: recipe.id });

  const list = await createList(owner.client);
  const committed = await owner.client.post(`/api/shopping-lists/${list.id}/from-meals`, {
    from: '2026-11-01',
    to: '2026-11-07',
  });
  assert.equal(committed.status, 201, JSON.stringify(committed.body));
  assert.equal(committed.body.data.added, 2);
  assert.equal(committed.body.data.merged, 0);
  assert.equal(committed.body.data.list.remaining, 2);

  // A reviewed selection only commits the chosen lines.
  const reviewed = await createList(owner.client, { name: 'Reviewed' });
  const selected = await owner.client.post(`/api/shopping-lists/${reviewed.id}/from-meals`, {
    from: '2026-11-01',
    to: '2026-11-07',
    items: [{ name: 'Rice', quantity: 250, unit: 'g', category: 'PANTRY' }],
  });
  assert.equal(selected.status, 201, JSON.stringify(selected.body));
  assert.equal(selected.body.data.added, 1);
  const items = await owner.client.get(`/api/shopping-lists/${reviewed.id}/items`);
  assert.deepEqual(
    items.body.data.items.map((item) => [item.name, item.quantity, item.unit, item.category]),
    [['Rice', 250, 'g', 'PANTRY']],
  );

  const missing = await owner.client.post(`/api/shopping-lists/${list.id}/from-meals`, {
    from: '2026-11-10',
  });
  assert.equal(missing.status, 400);
});

// ---- Shopping -> inventory ----

test('pushing a shopping item into inventory records a purchase and merges matching stock', async () => {
  const owner = await setup('to-inventory');
  const list = await createList(owner.client);
  const oil = await createItem(owner.client, list.id, {
    name: 'Olive Oil',
    quantity: 2,
    unit: 'bottle',
    category: 'PANTRY',
  });

  const first = await owner.client.post(
    `/api/shopping-lists/${list.id}/items/${oil.id}/to-inventory`,
    { location: 'PANTRY', expiresAt: '2027-01-01', note: 'Bought on offer' },
  );
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.data.merged, false);
  assert.equal(first.body.data.inventoryItem.name, 'Olive Oil');
  assert.equal(first.body.data.inventoryItem.quantity, 2);
  assert.equal(first.body.data.inventoryItem.unit, 'bottle');
  assert.equal(first.body.data.inventoryItem.location, 'PANTRY');
  assert.equal(first.body.data.inventoryItem.expiresAt, '2027-01-01');
  assert.equal(first.body.data.item.purchased, true);
  assert.ok(first.body.data.item.purchasedAt);

  const inventoryId = first.body.data.inventoryItem.id;
  const transactions = await owner.client.get(`/api/inventory/${inventoryId}/transactions`);
  assert.equal(transactions.status, 200);
  assert.equal(transactions.body.data.total, 1);
  assert.equal(transactions.body.data.items[0].type, 'PURCHASE');
  assert.equal(transactions.body.data.items[0].quantityAfter, 2);
  assert.equal(transactions.body.data.items[0].note, 'Bought on offer');

  const second = await createItem(owner.client, list.id, {
    name: 'olive oil',
    quantity: 3,
    unit: 'bottle',
    category: 'PANTRY',
  });
  const merged = await owner.client.post(
    `/api/shopping-lists/${list.id}/items/${second.id}/to-inventory`,
    {},
  );
  assert.equal(merged.status, 201, JSON.stringify(merged.body));
  assert.equal(merged.body.data.merged, true);
  assert.equal(merged.body.data.inventoryItem.id, inventoryId);
  assert.equal(merged.body.data.inventoryItem.quantity, 5);
  assert.equal(merged.body.data.item.purchased, true);

  const history = await owner.client.get(`/api/inventory/${inventoryId}/transactions`);
  assert.equal(history.body.data.total, 2);

  const badExpiry = await createItem(owner.client, list.id, { name: 'Tea' });
  const invalid = await owner.client.post(
    `/api/shopping-lists/${list.id}/items/${badExpiry.id}/to-inventory`,
    { expiresAt: '2026-02-30' },
  );
  assert.equal(invalid.status, 400);
});
