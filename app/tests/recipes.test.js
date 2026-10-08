import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'recipes.test.local';

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

async function createHousehold(client, name = 'Recipe Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

async function setup(label) {
  const owner = await createUser(label);
  await createHousehold(owner.client);
  return owner;
}

async function createRecipe(client, overrides = {}) {
  const response = await client.post('/api/recipes', {
    title: 'Tomato Pasta',
    servings: 2,
    ingredients: [
      { name: 'Pasta', quantity: 200, unit: 'g' },
      { name: 'Tomatoes', quantity: 4 },
    ],
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.recipe;
}

// ---- Access control ----

test('recipes require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/recipes')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/recipes')).status, 403);
});

test('recipes are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const recipe = await createRecipe(owner.client, { title: 'Secret Stew' });

  const stranger = await setup('isolation-b');

  assert.equal((await stranger.client.get(`/api/recipes/${recipe.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/recipes/${recipe.id}`, { title: 'X' })).status, 404);
  assert.equal((await stranger.client.del(`/api/recipes/${recipe.id}`)).status, 404);
  assert.equal((await stranger.client.post(`/api/recipes/${recipe.id}/favourite`, {})).status, 404);
  assert.equal((await stranger.client.post(`/api/recipes/${recipe.id}/duplicate`, {})).status, 404);

  const list = await stranger.client.get('/api/recipes');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.items, []);
});

// ---- Create / read / update / delete ----

test('creating a recipe trims fields, keeps ingredient order and sums total time', async () => {
  const owner = await setup('create');

  const response = await owner.client.post('/api/recipes', {
    title: '  Chicken Curry  ',
    description: '  Warm and cosy.  ',
    instructions: 'Simmer gently.\nServe with rice.',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 30,
    category: '  Dinner ',
    cuisine: 'Indian',
    notes: 'Family favourite',
    isFavourite: true,
    ingredients: [
      { name: '  Chicken  ', quantity: 1, unit: 'kg' },
      { name: 'Onion', quantity: 2, notes: 'finely chopped' },
      { name: 'Salt', optional: true },
    ],
  });

  assert.equal(response.status, 201, JSON.stringify(response.body));
  const recipe = response.body.data.recipe;

  assert.ok(recipe.id.startsWith('c'));
  assert.equal(recipe.title, 'Chicken Curry');
  assert.equal(recipe.description, 'Warm and cosy.');
  assert.equal(recipe.instructions, 'Simmer gently.\nServe with rice.');
  assert.equal(recipe.category, 'Dinner');
  assert.equal(recipe.cuisine, 'Indian');
  assert.equal(recipe.servings, 4);
  assert.equal(recipe.prepMinutes, 15);
  assert.equal(recipe.cookMinutes, 30);
  assert.equal(recipe.totalMinutes, 45);
  assert.equal(recipe.isFavourite, true);
  assert.equal(recipe.ingredientCount, 3);
  assert.equal(recipe.createdBy.id, owner.user.id);

  assert.deepEqual(
    recipe.ingredients.map((ingredient) => [
      ingredient.name,
      ingredient.quantity,
      ingredient.unit,
      ingredient.optional,
      ingredient.sortOrder,
    ]),
    [
      ['Chicken', 1, 'kg', false, 0],
      ['Onion', 2, null, false, 1],
      ['Salt', null, null, true, 2],
    ],
  );
  assert.equal(recipe.ingredients[1].notes, 'finely chopped');

  const fetched = await owner.client.get(`/api/recipes/${recipe.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.recipe.title, 'Chicken Curry');
  assert.equal(fetched.body.data.recipe.ingredients.length, 3);
});

test('a recipe without prep or cook time reports no total time', async () => {
  const owner = await setup('no-total');
  const recipe = await createRecipe(owner.client, { title: 'Fruit Bowl', ingredients: [] });
  assert.equal(recipe.totalMinutes, null);
  assert.equal(recipe.ingredientCount, 0);
});

test('creating a recipe validates title, servings, ingredients and quantities', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ title: '' }, 'title'],
    [{ title: 'x'.repeat(161) }, 'title'],
    [{ title: 'Ok', servings: 0 }, 'servings'],
    [{ title: 'Ok', servings: 101 }, 'servings'],
    [{ title: 'Ok', prepMinutes: -1 }, 'prepMinutes'],
    [{ title: 'Ok', cookMinutes: 1441 }, 'cookMinutes'],
    [{ title: 'Ok', ingredients: 'not-a-list' }, 'ingredients'],
    [{ title: 'Ok', ingredients: [{ name: '', quantity: 1 }] }, 'ingredients[0].name'],
    [{ title: 'Ok', ingredients: [{ name: 'Rice', quantity: 0 }] }, 'ingredients[0].quantity'],
    [{ title: 'Ok', ingredients: [{ name: 'Rice', quantity: 1, unit: 'x'.repeat(31) }] }, 'ingredients[0].unit'],
    [{ title: 'Ok', isFavourite: 'yes' }, 'isFavourite'],
  ];

  for (const [payload, field] of cases) {
    const response = await owner.client.post('/api/recipes', payload);
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(payload).slice(0, 90)}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }
});

test('updating a recipe only replaces ingredients when they are provided', async () => {
  const owner = await setup('update');
  const recipe = await createRecipe(owner.client);

  const titleOnly = await owner.client.patch(`/api/recipes/${recipe.id}`, {
    title: 'Creamy Pasta',
    notes: null,
  });
  assert.equal(titleOnly.status, 200, JSON.stringify(titleOnly.body));
  assert.equal(titleOnly.body.data.recipe.title, 'Creamy Pasta');
  assert.equal(titleOnly.body.data.recipe.notes, null);
  assert.deepEqual(
    titleOnly.body.data.recipe.ingredients.map((ingredient) => ingredient.name),
    ['Pasta', 'Tomatoes'],
  );

  const replaced = await owner.client.patch(`/api/recipes/${recipe.id}`, {
    ingredients: [{ name: 'Rice', quantity: 1.5, unit: 'cups' }],
  });
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  assert.deepEqual(
    replaced.body.data.recipe.ingredients.map((ingredient) => [
      ingredient.name,
      ingredient.quantity,
      ingredient.unit,
    ]),
    [['Rice', 1.5, 'cups']],
  );

  const cleared = await owner.client.patch(`/api/recipes/${recipe.id}`, { ingredients: [] });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body.data.recipe.ingredients, []);
  assert.equal(cleared.body.data.recipe.ingredientCount, 0);

  const emptyPatch = await owner.client.patch(`/api/recipes/${recipe.id}`, {});
  assert.equal(emptyPatch.status, 400);
  assert.ok(emptyPatch.body.error.details.some((detail) => detail.field === 'body'));

  const fetched = await owner.client.get(`/api/recipes/${recipe.id}`);
  assert.equal(fetched.body.data.recipe.title, 'Creamy Pasta');
});

test('favouriting and unfavouriting a recipe toggles the flag', async () => {
  const owner = await setup('favourite');
  const recipe = await createRecipe(owner.client);
  assert.equal(recipe.isFavourite, false);

  const favourite = await owner.client.post(`/api/recipes/${recipe.id}/favourite`, {});
  assert.equal(favourite.status, 200);
  assert.equal(favourite.body.data.recipe.isFavourite, true);

  const unfavourite = await owner.client.del(`/api/recipes/${recipe.id}/favourite`);
  assert.equal(unfavourite.status, 200);
  assert.equal(unfavourite.body.data.recipe.isFavourite, false);

  const missing = await owner.client.post('/api/recipes/cmisssing0000000000000000/favourite', {});
  assert.equal(missing.status, 404);
});

test('duplicating a recipe copies its ingredients and resets the favourite flag', async () => {
  const owner = await setup('duplicate');
  const source = await createRecipe(owner.client, {
    title: 'Sunday Roast',
    isFavourite: true,
    notes: 'Slow cook',
    ingredients: [
      { name: 'Beef', quantity: 1.5, unit: 'kg', notes: 'rolled' },
      { name: 'Potatoes', quantity: 8 },
    ],
  });

  const copyResponse = await owner.client.post(`/api/recipes/${source.id}/duplicate`, {});
  assert.equal(copyResponse.status, 201, JSON.stringify(copyResponse.body));
  const copy = copyResponse.body.data.recipe;

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.title, 'Sunday Roast (copy)');
  assert.equal(copy.isFavourite, false);
  assert.equal(copy.notes, 'Slow cook');
  assert.deepEqual(
    copy.ingredients.map((ingredient) => [ingredient.name, ingredient.quantity, ingredient.unit]),
    [
      ['Beef', 1.5, 'kg'],
      ['Potatoes', 8, null],
    ],
  );

  const named = await owner.client.post(`/api/recipes/${source.id}/duplicate`, {
    title: 'Monday Leftovers',
  });
  assert.equal(named.status, 201);
  assert.equal(named.body.data.recipe.title, 'Monday Leftovers');

  // The source is untouched.
  const fetched = await owner.client.get(`/api/recipes/${source.id}`);
  assert.equal(fetched.body.data.recipe.isFavourite, true);
  assert.equal(fetched.body.data.recipe.title, 'Sunday Roast');
});

test('deleting a recipe snapshots its title onto planned meals', async () => {
  const owner = await setup('delete-snapshot');
  const recipe = await createRecipe(owner.client, { title: 'Lentil Soup' });

  const mealResponse = await owner.client.post('/api/meals', {
    date: '2026-11-12',
    mealType: 'DINNER',
    recipeId: recipe.id,
  });
  assert.equal(mealResponse.status, 201, JSON.stringify(mealResponse.body));
  const meal = mealResponse.body.data.meal;

  const deleted = await owner.client.del(`/api/recipes/${recipe.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: recipe.id, deleted: true });
  assert.equal((await owner.client.get(`/api/recipes/${recipe.id}`)).status, 404);

  const fetchedMeal = await owner.client.get(`/api/meals/${meal.id}`);
  assert.equal(fetchedMeal.status, 200);
  assert.equal(fetchedMeal.body.data.meal.recipe, null);
  assert.equal(fetchedMeal.body.data.meal.title, 'Lentil Soup');
  assert.equal(fetchedMeal.body.data.meal.displayTitle, 'Lentil Soup');
});

// ---- Listing: search, filters, sorting, pagination, meta ----

test('listing recipes searches title and description, filters category/favourite and sorts', async () => {
  const owner = await setup('list');
  await createRecipe(owner.client, {
    title: 'Green Curry',
    description: 'Thai style',
    category: 'Dinner',
  });
  await createRecipe(owner.client, {
    title: 'Chocolate Cake',
    description: 'For curry night dessert',
    category: 'Dessert',
    isFavourite: true,
  });
  await createRecipe(owner.client, { title: 'Apple Crumble', category: 'Dessert' });

  const bySearch = await owner.client.get('/api/recipes?search=curry');
  assert.equal(bySearch.status, 200);
  assert.deepEqual(
    bySearch.body.data.items.map((item) => item.title).sort(),
    ['Chocolate Cake', 'Green Curry'],
  );

  const byCategory = await owner.client.get('/api/recipes?category=dinner');
  assert.equal(byCategory.status, 200);
  assert.deepEqual(byCategory.body.data.items.map((item) => item.title), ['Green Curry']);

  const byFavourite = await owner.client.get('/api/recipes?favourite=true');
  assert.equal(byFavourite.status, 200);
  assert.deepEqual(byFavourite.body.data.items.map((item) => item.title), ['Chocolate Cake']);

  const byTitle = await owner.client.get('/api/recipes?sort=title');
  assert.deepEqual(
    byTitle.body.data.items.map((item) => item.title),
    ['Apple Crumble', 'Chocolate Cake', 'Green Curry'],
  );

  const invalidSort = await owner.client.get('/api/recipes?sort=random');
  assert.equal(invalidSort.status, 400);
});

test('listing recipes paginates with page metadata', async () => {
  const owner = await setup('pagination');
  for (const title of ['Alpha', 'Bravo', 'Charlie']) {
    await createRecipe(owner.client, { title, ingredients: [] });
  }

  const first = await owner.client.get('/api/recipes?limit=2&page=1&sort=title');
  assert.equal(first.status, 200);
  assert.equal(first.body.data.total, 3);
  assert.equal(first.body.data.totalPages, 2);
  assert.deepEqual(first.body.data.items.map((item) => item.title), ['Alpha', 'Bravo']);

  const second = await owner.client.get('/api/recipes?limit=2&page=2&sort=title');
  assert.deepEqual(second.body.data.items.map((item) => item.title), ['Charlie']);

  const invalid = await owner.client.get('/api/recipes?page=0');
  assert.equal(invalid.status, 400);
});

test('recipe meta lists the distinct categories in use', async () => {
  const owner = await setup('meta');
  await createRecipe(owner.client, { title: 'One', category: 'Dinner', ingredients: [] });
  await createRecipe(owner.client, { title: 'Two', category: 'Dessert', ingredients: [] });
  await createRecipe(owner.client, { title: 'Three', category: 'Dinner', ingredients: [] });
  await createRecipe(owner.client, { title: 'Four', ingredients: [] });

  const response = await owner.client.get('/api/recipes/meta');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.categories, ['Dessert', 'Dinner']);
});
