import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'home-rooms.test.local';
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

async function createRoom(client, data = {}) {
  const response = await client.post('/api/home/rooms', {
    name: 'Kitchen',
    description: 'Main cooking space',
    ...data,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.room;
}

test('room endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/home/rooms')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/home/rooms')).status, 403);
});

test('rooms support create, get, list and search', async () => {
  const user = await createUser('room-crud');
  await createHousehold(user.client);

  const kitchen = await createRoom(user.client);
  assert.equal(kitchen.name, 'Kitchen');
  assert.equal(kitchen.description, 'Main cooking space');
  assert.equal(kitchen.active, true);
  assert.equal(kitchen.cleaningCount, 0);

  const fetched = await user.client.get(`/api/home/rooms/${kitchen.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.name, 'Kitchen');

  const list = await user.client.get('/api/home/rooms');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.total, 1);

  const searched = await user.client.get('/api/home/rooms?search=kitc');
  assert.equal(searched.body.data.total, 1);
  const none = await user.client.get('/api/home/rooms?search=bathroom');
  assert.equal(none.body.data.total, 0);
});

test('room names are case-insensitively unique and updates validate scope', async () => {
  const user = await createUser('room-unique');
  await createHousehold(user.client);
  await createRoom(user.client, { name: 'Kitchen' });

  const duplicate = await user.client.post('/api/home/rooms', { name: 'kitchen' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');

  const other = await createRoom(user.client, { name: 'Bathroom' });
  const renamed = await user.client.patch(`/api/home/rooms/${other.id}`, { name: 'Kitchen' });
  assert.equal(renamed.status, 409);

  const fine = await user.client.patch(`/api/home/rooms/${other.id}`, { name: 'Guest Bathroom' });
  assert.equal(fine.status, 200);
  assert.equal(fine.body.data.room.name, 'Guest Bathroom');

  const empty = await user.client.patch(`/api/home/rooms/${other.id}`, {});
  assert.equal(empty.status, 400);
});

test('rooms can be hidden with active=false and deleted when unused', async () => {
  const user = await createUser('room-lifecycle');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const hidden = await user.client.patch(`/api/home/rooms/${room.id}`, { active: false });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.data.room.active, false);

  const deleted = await user.client.del(`/api/home/rooms/${room.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);

  const gone = await user.client.get(`/api/home/rooms/${room.id}`);
  assert.equal(gone.status, 404);
});

test('a room with cleaning schedules cannot be deleted', async () => {
  const user = await createUser('room-in-use');
  await createHousehold(user.client);
  const room = await createRoom(user.client);

  const cleaning = await user.client.post('/api/home/cleaning', {
    roomId: room.id,
    title: 'Clean kitchen',
    frequency: 'WEEKLY',
  });
  assert.equal(cleaning.status, 201, JSON.stringify(cleaning.body));

  const response = await user.client.del(`/api/home/rooms/${room.id}`);
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'CONFLICT');

  // Deleting the schedule then the room works.
  assert.equal((await user.client.del(`/api/home/cleaning/${cleaning.body.data.cleaning.id}`)).status, 200);
  assert.equal((await user.client.del(`/api/home/rooms/${room.id}`)).status, 200);
});

test('rooms are isolated between households', async () => {
  const first = await createUser('room-iso-a');
  await createHousehold(first.client);
  const secondUser = await createUser('room-iso-b');
  await createHousehold(secondUser.client);

  const roomA = await createRoom(first.client, { name: 'Room A' });
  const roomB = await createRoom(secondUser.client, { name: 'Room B' });

  assert.equal((await first.client.get(`/api/home/rooms/${roomB.id}`)).status, 404);
  assert.equal((await first.client.patch(`/api/home/rooms/${roomB.id}`, { name: 'Hacked' })).status, 404);
  assert.equal((await first.client.del(`/api/home/rooms/${roomB.id}`)).status, 404);

  const listA = await first.client.get('/api/home/rooms');
  assert.equal(listA.body.data.total, 1);
  assert.equal(listA.body.data.items[0].id, roomA.id);
});