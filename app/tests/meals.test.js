import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'meals.test.local';

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

async function createHousehold(client, name = 'Meal Home') {
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
    title: 'Roast Chicken',
    servings: 4,
    ingredients: [{ name: 'Chicken', quantity: 1.5, unit: 'kg' }],
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.recipe;
}

async function createMeal(client, overrides = {}) {
  const response = await client.post('/api/meals', {
    date: '2026-11-10',
    mealType: 'DINNER',
    title: 'Soup',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.meal;
}

// ---- Access control ----

test('meals require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/meals')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/meals')).status, 403);
});

test('meals are isolated per household', async () => {
  const owner = await setup('isolation-a');
  const meal = await createMeal(owner.client);

  const stranger = await setup('isolation-b');

  assert.equal((await stranger.client.get(`/api/meals/${meal.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/meals/${meal.id}`, { title: 'X' })).status, 404);
  assert.equal((await stranger.client.del(`/api/meals/${meal.id}`)).status, 404);

  const list = await stranger.client.get('/api/meals?from=2026-11-01&to=2026-11-30');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.items, []);
});

// ---- Create / read / update / delete ----

test('creating a meal accepts a recipe or a free-text title', async () => {
  const owner = await setup('create');
  const recipe = await createRecipe(owner.client, { title: 'Lentil Curry' });

  const withRecipe = await owner.client.post('/api/meals', {
    date: '2026-11-10',
    mealType: 'DINNER',
    recipeId: recipe.id,
    notes: 'Double batch',
  });
  assert.equal(withRecipe.status, 201, JSON.stringify(withRecipe.body));
  const recipeMeal = withRecipe.body.data.meal;
  assert.ok(recipeMeal.id.startsWith('c'));
  assert.equal(recipeMeal.date, '2026-11-10');
  assert.equal(recipeMeal.mealType, 'DINNER');
  assert.equal(recipeMeal.title, null);
  assert.equal(recipeMeal.notes, 'Double batch');
  assert.equal(recipeMeal.displayTitle, 'Lentil Curry');
  assert.deepEqual(recipeMeal.recipe, { id: recipe.id, title: 'Lentil Curry', servings: 4 });

  const freeText = await createMeal(owner.client, {
    date: '2026-11-11',
    mealType: 'BREAKFAST',
    title: '  Porridge with berries  ',
  });
  assert.equal(freeText.title, 'Porridge with berries');
  assert.equal(freeText.displayTitle, 'Porridge with berries');
  assert.equal(freeText.recipe, null);

  // A recipe meal with an explicit label keeps the label as a fallback title.
  const labelled = await createMeal(owner.client, {
    date: '2026-11-12',
    mealType: 'LUNCH',
    recipeId: recipe.id,
    title: 'Leftovers',
  });
  assert.equal(labelled.title, 'Leftovers');
  assert.equal(labelled.displayTitle, 'Lentil Curry');
});

test('creating a meal validates date, meal type and recipe/title pairing', async () => {
  const owner = await setup('validate');

  const cases = [
    [{ mealType: 'DINNER', title: 'Soup' }, 'date'],
    [{ date: '2026-02-30', mealType: 'DINNER', title: 'Soup' }, 'date'],
    [{ date: '2026-11-10', title: 'Soup' }, 'mealType'],
    [{ date: '2026-11-10', mealType: 'BRUNCH', title: 'Soup' }, 'mealType'],
    [{ date: '2026-11-10', mealType: 'DINNER' }, 'title'],
    [{ date: '2026-11-10', mealType: 'DINNER', recipeId: 'not a valid id!' }, 'recipeId'],
  ];

  for (const [payload, field] of cases) {
    const response = await owner.client.post('/api/meals', payload);
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(payload)}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }
});

test('a meal cannot reference another household\'s recipe', async () => {
  const stranger = await setup('recipe-owner');
  const strangerRecipe = await createRecipe(stranger.client, { title: 'Their Stew' });

  const owner = await setup('recipe-user');
  const response = await owner.client.post('/api/meals', {
    date: '2026-11-10',
    mealType: 'DINNER',
    recipeId: strangerRecipe.id,
  });

  assert.equal(response.status, 400, JSON.stringify(response.body));
  assert.ok(response.body.error.details.some((detail) => detail.field === 'recipeId'));
});

test('updating and deleting a meal', async () => {
  const owner = await setup('update');
  const recipe = await createRecipe(owner.client, { title: 'Fish Pie' });
  const meal = await createMeal(owner.client, { title: 'Takeaway' });

  const moved = await owner.client.patch(`/api/meals/${meal.id}`, {
    date: '2026-11-15',
    mealType: 'LUNCH',
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.data.meal.date, '2026-11-15');
  assert.equal(moved.body.data.meal.mealType, 'LUNCH');
  assert.equal(moved.body.data.meal.displayTitle, 'Takeaway');

  const linked = await owner.client.patch(`/api/meals/${meal.id}`, { recipeId: recipe.id });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.data.meal.displayTitle, 'Fish Pie');
  assert.equal(linked.body.data.meal.recipe.id, recipe.id);

  const cleared = await owner.client.patch(`/api/meals/${meal.id}`, {
    recipeId: null,
    title: 'Fish and chips',
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.meal.recipe, null);
  assert.equal(cleared.body.data.meal.displayTitle, 'Fish and chips');

  const emptied = await owner.client.patch(`/api/meals/${meal.id}`, { title: null });
  assert.equal(emptied.status, 400);
  assert.ok(emptied.body.error.details.some((detail) => detail.field === 'title'));

  const emptyPatch = await owner.client.patch(`/api/meals/${meal.id}`, {});
  assert.equal(emptyPatch.status, 400);

  const deleted = await owner.client.del(`/api/meals/${meal.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: meal.id, deleted: true });
  assert.equal((await owner.client.get(`/api/meals/${meal.id}`)).status, 404);
});

// ---- Range queries ----

test('the default meal list covers the current Monday-to-Sunday week', async () => {
  const owner = await setup('current-week');
  const today = utcDate(0);
  await createMeal(owner.client, { date: today, mealType: 'DINNER', title: 'Tonight' });
  await createMeal(owner.client, { date: utcDate(30), mealType: 'DINNER', title: 'Far away' });

  const response = await owner.client.get('/api/meals');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const { items, from, to } = response.body.data;

  assert.equal((new Date(to) - new Date(from)) / 86_400_000, 6);
  assert.ok(from <= today && today <= to);
  assert.equal(new Date(from).getUTCDay(), 1);
  assert.deepEqual(items.map((item) => item.displayTitle), ['Tonight']);
});

test('a meal range can be filtered by explicit dates and meal type', async () => {
  const owner = await setup('range');
  await createMeal(owner.client, { date: '2026-11-02', mealType: 'BREAKFAST', title: 'Toast' });
  await createMeal(owner.client, { date: '2026-11-02', mealType: 'DINNER', title: 'Stew' });
  await createMeal(owner.client, { date: '2026-11-05', mealType: 'DINNER', title: 'Pasta' });
  await createMeal(owner.client, { date: '2026-12-01', mealType: 'DINNER', title: 'Outside' });

  const ranged = await owner.client.get('/api/meals?from=2026-11-01&to=2026-11-07');
  assert.equal(ranged.status, 200, JSON.stringify(ranged.body));
  // Same-date meals are ordered breakfast, lunch, snack, dinner.
  assert.deepEqual(
    ranged.body.data.items.map((item) => item.displayTitle),
    ['Toast', 'Stew', 'Pasta'],
  );
  assert.equal(ranged.body.data.from, '2026-11-01');
  assert.equal(ranged.body.data.to, '2026-11-07');

  const dinners = await owner.client.get(
    '/api/meals?from=2026-11-01&to=2026-11-07&mealType=DINNER',
  );
  assert.deepEqual(dinners.body.data.items.map((item) => item.displayTitle), ['Stew', 'Pasta']);

  // A single bound expands to a one-week window.
  const fromOnly = await owner.client.get('/api/meals?from=2026-11-02');
  assert.equal(fromOnly.body.data.from, '2026-11-02');
  assert.equal(fromOnly.body.data.to, '2026-11-08');

  const inverted = await owner.client.get('/api/meals?from=2026-11-07&to=2026-11-01');
  assert.equal(inverted.status, 400);

  const tooWide = await owner.client.get('/api/meals?from=2026-11-01&to=2027-02-15');
  assert.equal(tooWide.status, 400);
  assert.ok(tooWide.body.error.details.some((detail) => detail.field === 'to'));
});

// ---- Calendar integration ----

test('planned meals surface on the calendar as all-day MEAL events', async () => {
  const owner = await setup('calendar');
  const recipe = await createRecipe(owner.client, { title: 'Sunday Roast' });
  const dinner = await createMeal(owner.client, {
    date: '2026-11-10',
    mealType: 'DINNER',
    title: null,
    recipeId: recipe.id,
  });
  const lunch = await createMeal(owner.client, {
    date: '2026-11-10',
    mealType: 'LUNCH',
    title: 'Soup',
  });

  const response = await owner.client.get('/api/calendar?from=2026-11-10&to=2026-11-10');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const events = response.body.data.events.filter((event) => event.sourceType === 'MEAL');
  assert.equal(events.length, 2);

  const roast = events.find((event) => event.sourceId === dinner.id);
  assert.equal(roast.id, `meal:${dinner.id}`);
  assert.equal(roast.title, 'Sunday Roast');
  assert.equal(roast.allDay, true);
  assert.equal(roast.startAt, '2026-11-10T18:00:00.000Z');
  assert.equal(roast.endAt, roast.startAt);
  assert.deepEqual(roast.meal, {
    id: dinner.id,
    mealType: 'DINNER',
    title: null,
    recipe: { id: recipe.id, title: 'Sunday Roast' },
  });

  const soup = events.find((event) => event.sourceId === lunch.id);
  assert.equal(soup.startAt, '2026-11-10T12:00:00.000Z');
  assert.equal(soup.title, 'Soup');
});

test('deleting a recipe keeps the meal on the calendar with a snapshot title', async () => {
  const owner = await setup('calendar-snapshot');
  const recipe = await createRecipe(owner.client, { title: 'Mushroom Risotto' });
  const meal = await createMeal(owner.client, {
    date: '2026-11-10',
    mealType: 'DINNER',
    title: null,
    recipeId: recipe.id,
  });

  const deleted = await owner.client.del(`/api/recipes/${recipe.id}`);
  assert.equal(deleted.status, 200);

  const fetched = await owner.client.get(`/api/meals/${meal.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.meal.recipe, null);
  assert.equal(fetched.body.data.meal.title, 'Mushroom Risotto');
  assert.equal(fetched.body.data.meal.displayTitle, 'Mushroom Risotto');

  const events = await owner.client.get('/api/calendar?from=2026-11-10&to=2026-11-10');
  const event = events.body.data.events.find((item) => item.sourceId === meal.id);
  assert.ok(event, 'meal event should survive its recipe');
  assert.equal(event.title, 'Mushroom Risotto');
  assert.equal(event.meal.recipe, null);
});
