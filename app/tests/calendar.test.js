import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'calendar.test.local';

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

async function createHousehold(client, name = 'Calendar Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.household;
}

async function createEvent(client, overrides = {}) {
  const response = await client.post('/api/calendar', {
    title: 'Dentist appointment',
    start: '2026-11-10T09:00:00Z',
    end: '2026-11-10T10:00:00Z',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.event;
}

// ---- Access control ----

test('calendar requires authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  const unauthorized = await anonymous.get('/api/calendar');
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error.code, 'UNAUTHORIZED');

  const user = await createUser('no-household');
  const forbidden = await user.client.get('/api/calendar');
  assert.equal(forbidden.status, 403);
});

test('calendar events are isolated per household', async () => {
  const owner = await createUser('isolation-a');
  await createHousehold(owner.client, 'Home A');
  const event = await createEvent(owner.client);

  const stranger = await createUser('isolation-b');
  await createHousehold(stranger.client, 'Home B');

  assert.equal((await stranger.client.get(`/api/calendar/${event.id}`)).status, 404);
  assert.equal((await stranger.client.patch(`/api/calendar/${event.id}`, { title: 'X' })).status, 404);
  assert.equal((await stranger.client.del(`/api/calendar/${event.id}`)).status, 404);

  const range = await stranger.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  assert.deepEqual(range.body.data.events, []);
});

// ---- Create / read / update / delete ----

test('creating an event stores timed details and reminder settings', async () => {
  const owner = await createUser('create');
  await createHousehold(owner.client);

  const event = await createEvent(owner.client, {
    title: '  Parent meeting  ',
    description: 'Bring the forms.',
    location: '  School hall  ',
    category: 'FAMILY',
    reminder: { offsetMinutes: 60, enabled: true },
  });

  assert.equal(event.title, 'Parent meeting');
  assert.equal(event.description, 'Bring the forms.');
  assert.equal(event.location, 'School hall');
  assert.equal(event.category, 'FAMILY');
  assert.equal(event.allDay, false);
  assert.equal(event.startAt, '2026-11-10T09:00:00.000Z');
  assert.equal(event.endAt, '2026-11-10T10:00:00.000Z');
  assert.deepEqual(event.reminder, { offsetMinutes: 60, enabled: true });
  assert.equal(event.recurrence, null);
  assert.equal(event.recurring, false);
  assert.equal(event.sourceType, 'MANUAL');
  assert.equal(event.createdBy.name, 'Test User');
});

test('event create validation covers fields, ranges and reminders', async () => {
  const owner = await createUser('create-validation');
  await createHousehold(owner.client);

  const missingTitle = await owner.client.post('/api/calendar', { start: '2026-11-10' });
  assert.equal(missingTitle.status, 400);
  assert.ok(missingTitle.body.error.details.some((detail) => detail.field === 'title'));

  const missingStart = await owner.client.post('/api/calendar', { title: 'No start' });
  assert.equal(missingStart.status, 400);
  assert.ok(missingStart.body.error.details.some((detail) => detail.field === 'start'));

  const inverted = await owner.client.post('/api/calendar', {
    title: 'Backwards',
    start: '2026-11-10T10:00:00Z',
    end: '2026-11-10T09:00:00Z',
  });
  assert.equal(inverted.status, 400);
  assert.ok(inverted.body.error.details.some((detail) => detail.field === 'end'));

  const badCategory = await owner.client.post('/api/calendar', {
    title: 'Odd',
    start: '2026-11-10T09:00:00Z',
    category: 'PARTY',
  });
  assert.equal(badCategory.status, 400);
  assert.ok(badCategory.body.error.details.some((detail) => detail.field === 'category'));

  const badReminder = await owner.client.post('/api/calendar', {
    title: 'Odd',
    start: '2026-11-10T09:00:00Z',
    reminder: { offsetMinutes: -5 },
  });
  assert.equal(badReminder.status, 400);
  assert.ok(badReminder.body.error.details.some((detail) => detail.field === 'reminder'));

  const badAllDay = await owner.client.post('/api/calendar', {
    title: 'Odd',
    start: '2026-11-10',
    allDay: true,
    end: '2026-11-10T10:00:00Z',
  });
  assert.equal(badAllDay.status, 400);
});

test('all-day events accept date bounds and reject impossible dates', async () => {
  const owner = await createUser('all-day');
  await createHousehold(owner.client);

  const single = await createEvent(owner.client, {
    title: 'Public holiday',
    start: '2026-11-15',
    end: undefined,
    allDay: true,
  });
  assert.equal(single.allDay, true);
  assert.equal(single.startAt, '2026-11-15T00:00:00.000Z');
  assert.equal(single.endAt, '2026-11-15T00:00:00.000Z');

  const multi = await createEvent(owner.client, {
    title: 'Family visit',
    start: '2026-11-20',
    end: '2026-11-22',
    allDay: true,
  });
  assert.equal(multi.startAt, '2026-11-20T00:00:00.000Z');
  assert.equal(multi.endAt, '2026-11-22T00:00:00.000Z');

  const impossible = await owner.client.post('/api/calendar', {
    title: 'Never',
    start: '2026-02-30',
    allDay: true,
  });
  assert.equal(impossible.status, 400);

  const backwards = await owner.client.post('/api/calendar', {
    title: 'Backwards',
    start: '2026-11-22',
    end: '2026-11-20',
    allDay: true,
  });
  assert.equal(backwards.status, 400);
});

test('events update partially, toggle all-day and preserve duration', async () => {
  const owner = await createUser('update');
  await createHousehold(owner.client);
  const event = await createEvent(owner.client, {
    reminder: { offsetMinutes: 15, enabled: true },
  });

  const renamed = await owner.client.patch(`/api/calendar/${event.id}`, {
    title: 'Dentist (moved)',
    location: 'Clinic B',
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.event.title, 'Dentist (moved)');
  assert.equal(renamed.body.data.event.location, 'Clinic B');
  assert.equal(renamed.body.data.event.startAt, event.startAt);

  const moved = await owner.client.patch(`/api/calendar/${event.id}`, {
    start: '2026-11-10T11:00:00Z',
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.event.startAt, '2026-11-10T11:00:00.000Z');
  // Only the start moved: the one-hour duration is preserved.
  assert.equal(moved.body.data.event.endAt, '2026-11-10T12:00:00.000Z');

  const noReminder = await owner.client.patch(`/api/calendar/${event.id}`, { reminder: null });
  assert.equal(noReminder.status, 200);
  assert.equal(noReminder.body.data.event.reminder, null);

  const toAllDay = await owner.client.patch(`/api/calendar/${event.id}`, { allDay: true });
  assert.equal(toAllDay.status, 200);
  assert.equal(toAllDay.body.data.event.allDay, true);
  assert.equal(toAllDay.body.data.event.startAt, '2026-11-10T00:00:00.000Z');
  assert.equal(toAllDay.body.data.event.endAt, '2026-11-10T00:00:00.000Z');

  const toTimed = await owner.client.patch(`/api/calendar/${event.id}`, { allDay: false });
  assert.equal(toTimed.status, 200);
  assert.equal(toTimed.body.data.event.allDay, false);
  assert.equal(toTimed.body.data.event.startAt, '2026-11-10T00:00:00.000Z');
  assert.equal(toTimed.body.data.event.endAt, '2026-11-10T23:59:59.999Z');

  const emptyBody = await owner.client.patch(`/api/calendar/${event.id}`, {});
  assert.equal(emptyBody.status, 400);

  const removed = await owner.client.del(`/api/calendar/${event.id}`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body.data, { id: event.id, deleted: true });
  assert.equal((await owner.client.get(`/api/calendar/${event.id}`)).status, 404);
});

// ---- Ranged queries ----

test('range queries return overlapping events only and validate bounds', async () => {
  const owner = await createUser('range');
  await createHousehold(owner.client);

  await createEvent(owner.client, {
    title: 'November event',
    start: '2026-11-15T12:00:00Z',
    end: '2026-11-15T13:00:00Z',
  });
  await createEvent(owner.client, {
    title: 'December event',
    start: '2026-12-15T12:00:00Z',
    end: '2026-12-15T13:00:00Z',
  });
  // Multi-day event starting before the range but overlapping it.
  await createEvent(owner.client, {
    title: 'Retreat',
    start: '2026-10-30T09:00:00Z',
    end: '2026-11-02T17:00:00Z',
  });

  const response = await owner.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.from, '2026-11-01');
  assert.equal(response.body.data.to, '2026-11-30');
  assert.deepEqual(
    response.body.data.events.map((event) => event.title).sort(),
    ['November event', 'Retreat'],
  );
  assert.ok(response.body.data.events.every((event) => event.title !== 'December event'));

  const fromOnly = await owner.client.get('/api/calendar?from=2026-12-01');
  assert.deepEqual(
    fromOnly.body.data.events.map((event) => event.title),
    ['December event'],
  );

  const inverted = await owner.client.get('/api/calendar?from=2026-12-01&to=2026-11-01');
  assert.equal(inverted.status, 400);
  assert.ok(inverted.body.error.details.some((detail) => detail.field === 'to'));

  const tooLong = await owner.client.get('/api/calendar?from=2025-01-01&to=2026-12-31');
  assert.equal(tooLong.status, 400);

  const invalidDate = await owner.client.get('/api/calendar?from=2026-11-31&to=2026-12-01');
  assert.equal(invalidDate.status, 400);
  assert.ok(invalidDate.body.error.details.some((detail) => detail.field === 'from'));
});

// ---- Recurrence ----

test('recurring events expand in memory within the queried range', async () => {
  const owner = await createUser('recurring');
  await createHousehold(owner.client);

  const event = await createEvent(owner.client, {
    title: 'Weekly review',
    start: '2026-11-02T18:00:00Z',
    end: '2026-11-02T18:30:00Z',
    recurrence: { frequency: 'WEEKLY', interval: 1 },
  });
  assert.equal(event.recurring, true);
  assert.deepEqual(event.recurrence, { frequency: 'WEEKLY', interval: 1 });

  const month = await owner.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  const instances = month.body.data.events.filter((item) => item.title === 'Weekly review');
  assert.deepEqual(
    instances.map((item) => item.startAt),
    [
      '2026-11-02T18:00:00.000Z',
      '2026-11-09T18:00:00.000Z',
      '2026-11-16T18:00:00.000Z',
      '2026-11-23T18:00:00.000Z',
      '2026-11-30T18:00:00.000Z',
    ],
  );
  assert.ok(instances.every((item) => item.recurring === true));
  assert.ok(instances.every((item) => item.id === event.id));
  // Duration is preserved on every instance.
  assert.ok(
    instances.every(
      (item) => new Date(item.endAt).getTime() - new Date(item.startAt).getTime() === 30 * 60_000,
    ),
  );

  const singleDay = await owner.client.get('/api/calendar?from=2026-11-16&to=2026-11-16');
  assert.equal(singleDay.body.data.events.length, 1);
  assert.equal(singleDay.body.data.events[0].startAt, '2026-11-16T18:00:00.000Z');

  const beforeSeries = await owner.client.get('/api/calendar?from=2026-10-01&to=2026-10-31');
  assert.equal(beforeSeries.body.data.events.length, 0);

  const endDate = await owner.client.post('/api/calendar', {
    title: 'Short series',
    start: '2026-11-02T08:00:00Z',
    end: '2026-11-02T09:00:00Z',
    recurrence: { frequency: 'DAILY', endDate: '2026-11-05' },
  });
  assert.equal(endDate.status, 201);
  const capped = await owner.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  assert.equal(capped.body.data.events.filter((item) => item.title === 'Short series').length, 4);

  const badEnd = await owner.client.post('/api/calendar', {
    title: 'Impossible',
    start: '2026-11-10T08:00:00Z',
    recurrence: { frequency: 'DAILY', endDate: '2026-11-01' },
  });
  assert.equal(badEnd.status, 400);
  assert.ok(badEnd.body.error.details.some((detail) => detail.field === 'recurrence'));
});

// ---- Task integration ----

test('tasks with a due date appear on the calendar as derived items', async () => {
  const owner = await createUser('task-integration');
  await createHousehold(owner.client);

  const chore = await owner.client.post('/api/tasks', {
    title: 'Clean gutters',
    dueAt: '2026-11-18',
    priority: 'HIGH',
  });
  assert.equal(chore.status, 201, JSON.stringify(chore.body));

  const timed = await owner.client.post('/api/tasks', {
    title: 'Call insurance',
    dueAt: '2026-11-19T14:00:00Z',
    priority: 'URGENT',
  });
  assert.equal(timed.status, 201, JSON.stringify(timed.body));

  const cancelled = await owner.client.post('/api/tasks', {
    title: 'Cancelled chore',
    dueAt: '2026-11-20',
    status: 'CANCELLED',
  });
  assert.equal(cancelled.status, 201, JSON.stringify(cancelled.body));

  const response = await owner.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  const derived = response.body.data.events.filter((item) => item.sourceType === 'TASK');
  assert.deepEqual(
    derived.map((item) => item.title).sort(),
    ['Call insurance', 'Clean gutters'],
  );

  const allDayTask = derived.find((item) => item.title === 'Clean gutters');
  assert.equal(allDayTask.allDay, true);
  assert.equal(allDayTask.sourceId, chore.body.data.task.id);
  assert.equal(allDayTask.task.priority, 'HIGH');
  assert.equal(allDayTask.startAt, '2026-11-18T23:59:59.999Z');

  const timedTask = derived.find((item) => item.title === 'Call insurance');
  assert.equal(timedTask.allDay, false);
  assert.equal(timedTask.startAt, '2026-11-19T14:00:00.000Z');
  assert.equal(timedTask.task.priority, 'URGENT');

  assert.ok(!response.body.data.events.some((item) => item.title === 'Cancelled chore'));
});

// ---- Timezone-aware ranges ----

test('range boundaries follow the user timezone', async () => {
  const owner = await createUser('timezone', 'Asia/Jakarta'); // UTC+7
  await createHousehold(owner.client);

  // 16:30 UTC on Nov 10 is already Nov 10 23:30 locally.
  await createEvent(owner.client, {
    title: 'Late call',
    start: '2026-11-10T16:30:00Z',
    end: '2026-11-10T17:00:00Z',
  });

  const localDay = await owner.client.get('/api/calendar?from=2026-11-10&to=2026-11-10');
  assert.equal(localDay.body.data.events.length, 1);

  // A UTC event on Nov 10 18:00 is Nov 11 01:00 locally, so it belongs to the
  // next local day.
  await createEvent(owner.client, {
    title: 'Early morning',
    start: '2026-11-10T18:00:00Z',
    end: '2026-11-10T18:30:00Z',
  });
  const nov10 = await owner.client.get('/api/calendar?from=2026-11-10&to=2026-11-10');
  assert.deepEqual(
    nov10.body.data.events.map((event) => event.title),
    ['Late call'],
  );
  const nov11 = await owner.client.get('/api/calendar?from=2026-11-11&to=2026-11-11');
  assert.deepEqual(
    nov11.body.data.events.map((event) => event.title),
    ['Early morning'],
  );
});
