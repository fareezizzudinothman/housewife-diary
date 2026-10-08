import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'home-cleaning.test.local';
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
  const { email } = await registerUser(client, { domain: DOMAIN, label });
  return { client, email };
}

async function createHousehold(client) {
  const response = await client.post('/api/households', { name: 'Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
}

async function createRoom(client, name = 'Kitchen') {
  const response = await client.post('/api/home/rooms', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.room;
}

async function searchTasks(client, query) {
  const response = await client.get(`/api/tasks?search=${encodeURIComponent(query)}`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}

async function headFor(cleaning) {
  const tasks = await searchTasks(cleaning.owner.client, cleaning.title);
  return tasks.items.find((task) => task.source?.type === 'CLEANING');
}

test('cleaning schedules require a household and a room', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/home/cleaning')).status, 401);

  const user = await createUser('cleaning-auth');
  assert.equal((await user.client.get('/api/home/cleaning')).status, 403);

  await createHousehold(user.client);
  const noRoom = await user.client.post('/api/home/cleaning', {
    title: 'Clean',
    frequency: 'WEEKLY',
  });
  assert.equal(noRoom.status, 400);
  assert.equal(noRoom.body.error.details[0].field, 'roomId');
});

test('creating an ACTIVE schedule generates a recurring task series', async () => {
  const user = await createUser('cleaning-series');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const created = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Mop the floor',
    frequency: 'WEEKLY',
    interval: 2,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const cleaning = created.body.data.cleaning;
  assert.equal(cleaning.frequency, 'WEEKLY');
  assert.equal(cleaning.interval, 2);
  assert.equal(cleaning.status, 'ACTIVE');
  assert.equal(cleaning.room.name, 'Kitchen');
  assert.ok(cleaning.nextDueAt, 'expected a next-due date for an active schedule');

  const tasks = await searchTasks(user.client, 'Mop the floor');
  assert.ok(tasks.total >= 1, JSON.stringify(tasks));
  const head = tasks.items.find((task) => task.source?.type === 'CLEANING');
  assert.ok(head, 'expected a CLEANING head task');
  assert.equal(head.source.id, cleaning.id);
  assert.equal(head.recurrence.frequency, 'WEEKLY');
  assert.equal(head.recurrence.interval, 2);
  assert.ok(cleaning.nextDueAt <= head.dueAt.slice(0, 10), 'nextDueAt should lead the head due');
});

test('pausing removes generated tasks; resuming recreates them', async () => {
  const user = await createUser('cleaning-pause');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const created = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Wipe counters',
    frequency: 'DAILY',
  });
  const id = created.body.data.cleaning.id;
  const tasks = await searchTasks(user.client, 'Wipe counters');
  assert.ok(tasks.total >= 1);

  const paused = await user.client.patch(`/api/home/cleaning/${id}`, { status: 'PAUSED' });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.data.cleaning.status, 'PAUSED');
  assert.equal(paused.body.data.cleaning.nextDueAt, null);
  const afterPause = await searchTasks(user.client, 'Wipe counters');
  assert.equal(afterPause.total, 0);

  const resumed = await user.client.patch(`/api/home/cleaning/${id}`, { status: 'ACTIVE' });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.data.cleaning.status, 'ACTIVE');
  assert.ok(resumed.body.data.cleaning.nextDueAt);
  const afterResume = await searchTasks(user.client, 'Wipe counters');
  assert.ok(afterResume.total >= 1);
});

test('editing an active schedule keeps the generated head task in sync', async () => {
  const user = await createUser('cleaning-edit');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const created = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Vacuum living room',
    frequency: 'WEEKLY',
  });
  const id = created.body.data.cleaning.id;

  const updated = await user.client.patch(`/api/home/cleaning/${id}`, {
    title: 'Vacuum and dust living room',
    frequency: 'MONTHLY',
    interval: 1,
  });
  assert.equal(updated.status, 200);

  const tasks = await searchTasks(user.client, 'Vacuum and dust');
  const head = tasks.items.find((task) => task.source?.type === 'CLEANING');
  assert.ok(head, 'expected a CLEANING head task');
  assert.equal(head.recurrence.frequency, 'MONTHLY');
  assert.equal(head.recurrence.interval, 1);
});

test('deleting a schedule removes its generated tasks', async () => {
  const user = await createUser('cleaning-delete');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const created = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Scrub tiles',
    frequency: 'MONTHLY',
  });
  assert.ok((await searchTasks(user.client, 'Scrub tiles')).items.length >= 1);

  const removed = await user.client.del(`/api/home/cleaning/${created.body.data.cleaning.id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.deleted, true);
  assert.equal((await searchTasks(user.client, 'Scrub tiles')).total, 0);
});

test('cleaning schedules reject invalid input and are household-scoped', async () => {
  const user = await createUser('cleaning-validate');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const badFrequency = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Nope',
    frequency: 'YEARLY',
  });
  assert.equal(badFrequency.status, 400);
  assert.equal(badFrequency.body.error.details[0].field, 'frequency');

  const smallInterval = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Nope',
    frequency: 'WEEKLY',
    interval: 0,
  });
  assert.equal(smallInterval.status, 400);

  const absentRoom = await user.client.post('/api/home/cleaning', {
    roomId: 'does-not-exist',
    title: 'Nope',
    frequency: 'WEEKLY',
  });
  assert.equal(absentRoom.status, 400);

  const created = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Isolated',
    frequency: 'WEEKLY',
  });
  const secondUser = await createUser('cleaning-iso');
  await createHousehold(secondUser.client);
  assert.equal((await secondUser.client.get(`/api/home/cleaning/${created.body.data.cleaning.id}`)).status, 404);
  assert.equal((await secondUser.client.patch(`/api/home/cleaning/${created.body.data.cleaning.id}`, { status: 'PAUSED' })).status, 404);
  assert.equal((await secondUser.client.del(`/api/home/cleaning/${created.body.data.cleaning.id}`)).status, 404);

  // Cleaning can be assigned to an active family member only.
  const member = await user.client.post('/api/family/members', { name: 'Helper', relationship: 'Child' });
  assert.equal(member.status, 201);
  const assigned = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'With helper',
    frequency: 'WEEKLY',
    assignedFamilyMemberId: member.body.data.member.id,
  });
  assert.equal(assigned.status, 201);
  assert.equal(assigned.body.data.cleaning.assignedFamilyMember.name, 'Helper');

  const tasks = await searchTasks(user.client, 'With helper');
  const head = tasks.items.find((task) => task.source?.type === 'CLEANING');
  assert.equal(head.familyAssignee.id, member.body.data.member.id);
});