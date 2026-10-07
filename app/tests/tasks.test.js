import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain, prisma } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'tasks.test.local';
const DAY_MS = 86_400_000;

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

async function createUser(label, timezone = 'UTC') {
  const client = newClient(baseUrl);
  const { email, user } = await registerUser(client, { domain: DOMAIN, label, timezone });
  return { client, email, user };
}

async function createHousehold(client, name = 'Task Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.household;
}

async function createTask(client, overrides = {}) {
  const response = await client.post('/api/tasks', {
    title: 'Water the plants',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.task;
}

function dateOnly(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

// ---- Access control ----

test('tasks require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  const unauthorized = await anonymous.get('/api/tasks');
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error.code, 'UNAUTHORIZED');

  const user = await createUser('tasks-no-household');
  const forbidden = await user.client.get('/api/tasks');
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'FORBIDDEN');

  for (const path of ['/api/tasks/meta', '/api/tasks/categories']) {
    const response = await user.client.get(path);
    assert.equal(response.status, 403, path);
  }
});

test('tasks are isolated per household and never resolve across households', async () => {
  const owner = await createUser('isolation-a');
  await createHousehold(owner.client, 'Home A');
  const task = await createTask(owner.client, { title: 'Private errand' });

  const stranger = await createUser('isolation-b');
  await createHousehold(stranger.client, 'Home B');

  const read = await stranger.client.get(`/api/tasks/${task.id}`);
  assert.equal(read.status, 404);
  const patch = await stranger.client.patch(`/api/tasks/${task.id}`, { title: 'Stolen' });
  assert.equal(patch.status, 404);
  const remove = await stranger.client.del(`/api/tasks/${task.id}`);
  assert.equal(remove.status, 404);
  const complete = await stranger.client.post(`/api/tasks/${task.id}/complete`, {});
  assert.equal(complete.status, 404);

  const list = await stranger.client.get('/api/tasks');
  assert.equal(list.body.data.total, 0);
});

// ---- Create / read / update / delete ----

test('creating a task trims input, applies defaults and stores a date-only due date', async () => {
  const owner = await createUser('create');
  await createHousehold(owner.client);

  const response = await owner.client.post('/api/tasks', {
    title: '  Clean the kitchen  ',
    description: 'Counters, sink and floor.',
    dueAt: '2026-10-10',
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const task = response.body.data.task;

  assert.equal(task.title, 'Clean the kitchen');
  assert.equal(task.description, 'Counters, sink and floor.');
  assert.equal(task.status, 'TODO');
  assert.equal(task.priority, 'MEDIUM');
  assert.equal(task.category, null);
  assert.equal(task.assignee, null);
  assert.equal(task.recurrence, null);
  assert.equal(task.repeating, false);
  // Date-only due dates are the end of that day in the user's timezone.
  assert.equal(task.dueAt, '2026-10-10T23:59:59.999Z');
  assert.ok(task.id.startsWith('c'));
});

test('task create validation reports per-field errors', async () => {
  const owner = await createUser('create-validation');
  await createHousehold(owner.client);

  const missingTitle = await owner.client.post('/api/tasks', { title: '   ' });
  assert.equal(missingTitle.status, 400);
  assert.ok(missingTitle.body.error.details.some((detail) => detail.field === 'title'));

  const badPriority = await owner.client.post('/api/tasks', {
    title: 'Task',
    priority: 'SOMEDAY',
  });
  assert.equal(badPriority.status, 400);
  assert.ok(badPriority.body.error.details.some((detail) => detail.field === 'priority'));

  const badStatus = await owner.client.post('/api/tasks', { title: 'Task', status: 'DONE' });
  assert.equal(badStatus.status, 400);
  assert.ok(badStatus.body.error.details.some((detail) => detail.field === 'status'));

  const badDue = await owner.client.post('/api/tasks', { title: 'Task', dueAt: '2026-02-30' });
  assert.equal(badDue.status, 400);
  assert.ok(badDue.body.error.details.some((detail) => detail.field === 'dueAt'));

  const recurrenceWithoutDue = await owner.client.post('/api/tasks', {
    title: 'Task',
    recurrence: { frequency: 'DAILY' },
  });
  assert.equal(recurrenceWithoutDue.status, 400);
  assert.ok(
    recurrenceWithoutDue.body.error.details.some((detail) => detail.field === 'dueAt'),
  );

  const unknownCategory = await owner.client.post('/api/tasks', {
    title: 'Task',
    categoryId: 'ckx0000000000000000000000',
  });
  assert.equal(unknownCategory.status, 400);
  assert.ok(unknownCategory.body.error.details.some((detail) => detail.field === 'categoryId'));
});

test('a task can be read, partially updated, completed and deleted', async () => {
  const owner = await createUser('crud');
  await createHousehold(owner.client);
  const task = await createTask(owner.client, { title: 'Dust shelves', priority: 'LOW' });

  const detail = await owner.client.get(`/api/tasks/${task.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.task.title, 'Dust shelves');

  const updated = await owner.client.patch(`/api/tasks/${task.id}`, {
    title: 'Dust the shelves',
    priority: 'HIGH',
    description: 'Living room first.',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.task.title, 'Dust the shelves');
  assert.equal(updated.body.data.task.priority, 'HIGH');
  assert.equal(updated.body.data.task.description, 'Living room first.');

  const empty = await owner.client.patch(`/api/tasks/${task.id}`, {});
  assert.equal(empty.status, 400);

  const completed = await owner.client.post(`/api/tasks/${task.id}/complete`, {});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.task.status, 'COMPLETED');
  assert.ok(completed.body.data.task.completedAt);

  // Reopening clears completedAt.
  const reopened = await owner.client.patch(`/api/tasks/${task.id}`, { status: 'TODO' });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.data.task.completedAt, null);

  const removed = await owner.client.del(`/api/tasks/${task.id}`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.data, { id: task.id, deleted: true });
  const gone = await owner.client.get(`/api/tasks/${task.id}`);
  assert.equal(gone.status, 404);
});

// ---- Categories ----

test('categories are household scoped with duplicate protection and safe deletion', async () => {
  const owner = await createUser('categories');
  await createHousehold(owner.client);

  const created = await owner.client.post('/api/tasks/categories', { name: '  Cleaning  ' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const category = created.body.data.category;
  assert.equal(category.name, 'Cleaning');

  const duplicate = await owner.client.post('/api/tasks/categories', { name: 'cleaning' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');

  const invalid = await owner.client.post('/api/tasks/categories', { name: '' });
  assert.equal(invalid.status, 400);

  await createTask(owner.client, { title: 'Scrub floor', categoryId: category.id });
  const listed = await owner.client.get('/api/tasks/categories');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.categories, [
    { id: category.id, name: 'Cleaning', taskCount: 1 },
  ]);

  // The other household never sees the category and cannot delete it.
  const stranger = await createUser('categories-stranger');
  await createHousehold(stranger.client, 'Elsewhere');
  const strangerList = await stranger.client.get('/api/tasks/categories');
  assert.deepEqual(strangerList.body.data.categories, []);
  const strangerDelete = await stranger.client.del(`/api/tasks/categories/${category.id}`);
  assert.equal(strangerDelete.status, 404);

  const removed = await owner.client.del(`/api/tasks/categories/${category.id}`);
  assert.equal(removed.status, 200);
  // Tasks keep existing; the reference is cleared.
  const tasks = await owner.client.get('/api/tasks');
  assert.equal(tasks.body.data.items[0].category, null);
});

// ---- Assignment ----

test('tasks can be assigned to household members only', async () => {
  const owner = await createUser('assign-owner');
  const household = await createHousehold(owner.client, 'Assignments');

  const member = await createUser('assign-member');
  const added = await owner.client.post(`/api/households/${household.id}/members`, {
    email: member.email,
    role: 'MEMBER',
  });
  assert.equal(added.status, 201, JSON.stringify(added.body));

  const assigned = await createTask(owner.client, {
    title: 'Pick up parcel',
    assignedToId: member.user.id,
  });
  assert.deepEqual(assigned.assignee, { id: member.user.id, name: 'Test User' });

  const outsider = await createUser('assign-outsider');
  await createHousehold(outsider.client, 'Other home');
  const rejected = await owner.client.post('/api/tasks', {
    title: 'Nope',
    assignedToId: outsider.user.id,
  });
  assert.equal(rejected.status, 400);
  assert.ok(rejected.body.error.details.some((detail) => detail.field === 'assignedToId'));

  const unassign = await owner.client.patch(`/api/tasks/${assigned.id}`, { assignedToId: null });
  assert.equal(unassign.status, 200);
  assert.equal(unassign.body.data.task.assignee, null);
});

// ---- Views, filters, sorting, pagination ----

test('task views cover today, upcoming, overdue, completed and all', async () => {
  const owner = await createUser('views');
  await createHousehold(owner.client);

  const overdue = await createTask(owner.client, { title: 'Overdue chore', dueAt: dateOnly(-2) });
  const today = await createTask(owner.client, { title: 'Today chore', dueAt: dateOnly(0) });
  const upcoming = await createTask(owner.client, { title: 'Upcoming chore', dueAt: dateOnly(3) });
  const completed = await createTask(owner.client, { title: 'Done chore', dueAt: dateOnly(1) });
  await owner.client.post(`/api/tasks/${completed.id}/complete`, {});
  const undated = await createTask(owner.client, { title: 'Someday chore' });

  const todayView = await owner.client.get('/api/tasks?view=today');
  assert.deepEqual(
    todayView.body.data.items.map((task) => task.id),
    [today.id],
  );

  const upcomingView = await owner.client.get('/api/tasks?view=upcoming');
  assert.deepEqual(
    upcomingView.body.data.items.map((task) => task.id),
    [upcoming.id],
  );

  const overdueView = await owner.client.get('/api/tasks?view=overdue');
  assert.deepEqual(
    overdueView.body.data.items.map((task) => task.id),
    [overdue.id],
  );

  const completedView = await owner.client.get('/api/tasks?view=completed');
  assert.deepEqual(
    completedView.body.data.items.map((task) => task.id),
    [completed.id],
  );

  const allView = await owner.client.get('/api/tasks?view=all');
  assert.equal(allView.body.data.total, 5);
  assert.ok(allView.body.data.items.some((task) => task.id === undated.id));

  // Explicit status overrides the view's default status set.
  const cancelledToday = await owner.client.get('/api/tasks?view=today&status=CANCELLED');
  assert.equal(cancelledToday.body.data.total, 0);
});

test('task list filters, search, sorting and pagination work together', async () => {
  const owner = await createUser('filters');
  await createHousehold(owner.client);

  const category = await owner.client.post('/api/tasks/categories', { name: 'Errands' });
  const categoryId = category.body.data.category.id;

  await createTask(owner.client, {
    title: 'Buy milk',
    dueAt: dateOnly(1),
    priority: 'LOW',
    categoryId,
  });
  await createTask(owner.client, {
    title: 'Buy bread',
    description: 'Whole grain please',
    dueAt: dateOnly(2),
    priority: 'URGENT',
    categoryId,
  });
  await createTask(owner.client, { title: 'Call plumber', dueAt: dateOnly(3), priority: 'HIGH' });

  const byPriority = await owner.client.get('/api/tasks?priority=URGENT');
  assert.equal(byPriority.body.data.total, 1);
  assert.equal(byPriority.body.data.items[0].title, 'Buy bread');

  const byCategory = await owner.client.get(`/api/tasks?category=${categoryId}`);
  assert.equal(byCategory.body.data.total, 2);

  const noneCategory = await owner.client.get('/api/tasks?category=none');
  assert.equal(noneCategory.body.data.total, 1);
  assert.equal(noneCategory.body.data.items[0].title, 'Call plumber');

  const search = await owner.client.get('/api/tasks?search=whole%20grain');
  assert.equal(search.body.data.total, 1);
  assert.equal(search.body.data.items[0].title, 'Buy bread');

  const sorted = await owner.client.get('/api/tasks?sort=priority&dir=desc');
  assert.deepEqual(
    sorted.body.data.items.map((task) => task.priority),
    ['URGENT', 'HIGH', 'LOW'],
  );

  const paged = await owner.client.get('/api/tasks?limit=2&page=2');
  assert.equal(paged.body.data.total, 3);
  assert.equal(paged.body.data.totalPages, 2);
  assert.equal(paged.body.data.items.length, 1);

  const badLimit = await owner.client.get('/api/tasks?limit=999');
  assert.equal(badLimit.status, 400);
  assert.ok(badLimit.body.error.details.some((detail) => detail.field === 'limit'));

  const badView = await owner.client.get('/api/tasks?view=tomorrow');
  assert.equal(badView.status, 400);
});

// ---- Recurrence ----

test('recurring tasks materialize a bounded window of occurrences', async () => {
  const owner = await createUser('recurring');
  await createHousehold(owner.client);

  const head = await createTask(owner.client, {
    title: 'Water plants',
    dueAt: dateOnly(0),
    recurrence: { frequency: 'DAILY', interval: 1 },
  });
  assert.equal(head.repeating, true);
  assert.equal(head.seriesId, null);
  assert.deepEqual(head.recurrence, { frequency: 'DAILY', interval: 1 });

  const rows = await prisma.task.findMany({
    where: { seriesId: head.id },
    orderBy: { dueAt: 'asc' },
  });
  assert.ok(rows.length >= 85, `expected a ~90-day window, got ${rows.length}`);
  assert.ok(rows.length <= 120, `expected a bounded window, got ${rows.length}`);

  const dueDates = new Set(rows.map((row) => row.dueAt.toISOString()));
  assert.equal(dueDates.size, rows.length, 'occurrences must not contain duplicates');

  const first = rows[0].dueAt.getTime();
  const last = rows[rows.length - 1].dueAt.getTime();
  assert.ok(first >= Date.now() - 8 * DAY_MS);
  assert.ok(last <= Date.now() + 91 * DAY_MS);
  for (const row of rows) {
    assert.equal(row.status, 'TODO');
    assert.equal(row.recurrence, null);
    assert.equal(row.priority, head.priority);
  }

  // The head plus occurrences all appear in the list.
  const listed = await owner.client.get('/api/tasks?view=all&limit=50&page=1');
  assert.equal(listed.body.data.total, rows.length + 1);
  assert.equal(listed.body.data.totalPages, 2);
});

test('recurring tasks honour weekly weekdays and an end date', async () => {
  const owner = await createUser('weekly');
  await createHousehold(owner.client);

  const head = await createTask(owner.client, {
    title: 'Weekend tidy',
    dueAt: '2026-10-10', // a Saturday
    recurrence: { frequency: 'WEEKLY', interval: 1, daysOfWeek: [0, 6], endDate: '2026-12-31' },
  });

  const rows = await prisma.task.findMany({
    where: { seriesId: head.id },
    orderBy: { dueAt: 'asc' },
  });
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const weekday = row.dueAt.getUTCDay();
    assert.ok(weekday === 0 || weekday === 6, `unexpected weekday ${weekday}`);
    assert.ok(row.dueAt.toISOString().slice(0, 10) <= '2026-12-31');
  }

  const badEnd = await owner.client.post('/api/tasks', {
    title: 'Impossible',
    dueAt: '2026-10-10',
    recurrence: { frequency: 'DAILY', endDate: '2026-10-01' },
  });
  assert.equal(badEnd.status, 400);
  assert.ok(badEnd.body.error.details.some((detail) => detail.field === 'recurrence'));
});

test('editing a series head reschedules its open occurrences', async () => {
  const owner = await createUser('reschedule');
  await createHousehold(owner.client);

  const head = await createTask(owner.client, {
    title: 'Morning walk',
    dueAt: dateOnly(1),
    recurrence: { frequency: 'DAILY', interval: 1 },
  });
  const before = await prisma.task.findMany({ where: { seriesId: head.id } });
  assert.ok(before.length > 0);

  const oldFirst = before.map((row) => row.dueAt.getTime()).sort((a, b) => a - b)[0];
  const updated = await owner.client.patch(`/api/tasks/${head.id}`, {
    dueAt: dateOnly(2),
    title: 'Evening walk',
  });
  assert.equal(updated.status, 200);

  const after = await prisma.task.findMany({
    where: { seriesId: head.id },
    orderBy: { dueAt: 'asc' },
  });
  assert.ok(after.length > 0);
  assert.ok(after[0].dueAt.getTime() > oldFirst, 'old occurrences were dropped');
  for (const row of after) {
    assert.equal(row.title, 'Evening walk');
  }
});

test('completing one occurrence leaves the rest of the series open', async () => {
  const owner = await createUser('occurrence');
  await createHousehold(owner.client);

  const head = await createTask(owner.client, {
    title: 'Take vitamins',
    dueAt: dateOnly(0),
    recurrence: { frequency: 'DAILY', interval: 1 },
  });
  const occurrence = await prisma.task.findFirst({ where: { seriesId: head.id } });

  const completed = await owner.client.post(`/api/tasks/${occurrence.id}/complete`, {});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.data.task.status, 'COMPLETED');

  const openCount = await prisma.task.count({
    where: { seriesId: head.id, status: 'TODO' },
  });
  assert.ok(openCount > 0);
});

test('deleting a series head removes its occurrences', async () => {
  const owner = await createUser('delete-series');
  await createHousehold(owner.client);

  const head = await createTask(owner.client, {
    title: 'Daily reading',
    dueAt: dateOnly(0),
    recurrence: { frequency: 'DAILY', interval: 1 },
  });
  assert.ok((await prisma.task.count({ where: { seriesId: head.id } })) > 0);

  const removed = await owner.client.del(`/api/tasks/${head.id}`);
  assert.equal(removed.status, 200);
  assert.equal(await prisma.task.count({ where: { seriesId: head.id } }), 0);
});
