import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'notes.test.local';
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
  return response.body.data.household;
}

test('note endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/notes')).status, 401);

  const user = await createUser('note-auth');
  assert.equal((await user.client.get('/api/notes')).status, 403);
});

test('notes can be created as shared household content', async () => {
  const user = await createUser('note-create');
  const household = await createHousehold(user.client);

  const created = await user.client.post('/api/notes', {
    title: 'Vaccination schedule',
    content: 'Mia: 4 months boosters\nNoah: due next week.',
    category: 'Health',
    tags: ['kids', 'Health'],
    pinned: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const note = created.body.data.note;
  assert.equal(note.title, 'Vaccination schedule');
  assert.equal(note.content, 'Mia: 4 months boosters\nNoah: due next week.');
  assert.equal(note.category, 'Health');
  assert.equal(note.pinned, true);
  assert.equal(note.archived, false);
  assert.deepEqual(note.tags.map((tag) => tag.name).sort(), ['Health', 'kids']);
  assert.equal(note.createdBy.email, undefined);
  assert.ok(note.createdBy.id);

  // The second member of the household can read the same note.
  const second = await createUser('note-create-2');
  const secondJoined = await user.client.post(`/api/households/${household.id}/members`, { email: second.email, role: 'MEMBER' });
  assert.equal(secondJoined.status, 201, JSON.stringify(secondJoined.body));
  const switched = await second.client.post(`/api/households/${household.id}/switch`);
  assert.equal(switched.status, 200, JSON.stringify(switched.body));
  const detail = await second.client.get(`/api/notes/${note.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.note.title, 'Vaccination schedule');
});

test('note list supports search, category, tag, pinned and archived filters', async () => {
  const user = await createUser('note-list');
  await createHousehold(user.client);

  await user.client.post('/api/notes', { title: 'Grocery staples', content: 'rice oil salt', tags: ['shopping'] });
  await user.client.post('/api/notes', { title: 'Emergency numbers', content: 'police fire clinic', category: 'Safety', pinned: true });
  await user.client.post('/api/notes', { title: 'Old recipe', content: 'pancake mix', archived: true });

  assert.equal((await user.client.get('/api/notes')).body.data.total, 3);
  assert.equal((await user.client.get('/api/notes?search=numbers')).body.data.total, 1);
  assert.equal((await user.client.get('/api/notes?category=Safety')).body.data.total, 1);
  assert.equal((await user.client.get('/api/notes?tag=Shopping')).body.data.total, 1);
  assert.equal((await user.client.get('/api/notes?pinned=true')).body.data.total, 1);
  assert.equal((await user.client.get('/api/notes?archived=true')).body.data.total, 1);
  assert.equal((await user.client.get('/api/notes?archived=false')).body.data.total, 2);

  const pinned = await user.client.get('/api/notes?pinned=true');
  assert.equal(pinned.body.data.items[0].title, 'Emergency numbers');

  // Empty content is rejected.
  const bad = await user.client.post('/api/notes', { title: 'No body' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.details[0].field, 'content');
});

test('notes share a household tag vocabulary', async () => {
  const user = await createUser('note-tags');
  await createHousehold(user.client);

  await user.client.post('/api/notes', { title: 'A', content: 'aaa', tags: ['Budget'] });
  await user.client.post('/api/notes', { title: 'B', content: 'bbb', tags: ['budget', 'house'] });

  const vocabulary = await user.client.get('/api/notes/tags');
  assert.equal(vocabulary.status, 200);
  const tags = vocabulary.body.data.items;
  assert.equal(tags.length, 2);
  const budget = tags.find((tag) => tag.name === 'Budget');
  assert.equal(budget.count, 2);
  assert.ok(tags.find((tag) => tag.name === 'house' && tag.count === 1));

  // The same note can revisit a tag name and see the original casing.
  const search = await user.client.get('/api/notes?tag=BUDGET');
  assert.equal(search.body.data.total, 2);
});

test('notes can be updated and archived', async () => {
  const user = await createUser('note-update');
  await createHousehold(user.client);

  const created = await user.client.post('/api/notes', {
    title: 'Draft',
    content: 'maybe keep this',
    tags: ['draft'],
  });
  const note = created.body.data.note;

  const updated = await user.client.patch(`/api/notes/${note.id}`, {
    title: 'Shopping list',
    content: 'milk bread eggs',
    pinned: true,
    tags: ['food', 'shopping'],
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const patched = updated.body.data.note;
  assert.equal(patched.title, 'Shopping list');
  assert.equal(patched.pinned, true);
  assert.deepEqual(patched.tags.map((tag) => tag.name).sort(), ['food', 'shopping']);

  const archived = await user.client.patch(`/api/notes/${note.id}`, { archived: true });
  assert.equal(archived.body.data.note.archived, true);

  // Clearing the tag list removes all links.
  const noTags = await user.client.patch(`/api/notes/${note.id}`, { tags: [] });
  assert.deepEqual(noTags.body.data.note.tags, []);
});

test('notes are isolated between households and can be deleted', async () => {
  const user = await createUser('note-iso');
  await createHousehold(user.client);
  const created = await user.client.post('/api/notes', { title: 'Private', content: 'secret' });
  const note = created.body.data.note;

  const second = await createUser('note-iso-2');
  await createHousehold(second.client);
  assert.equal((await second.client.get(`/api/notes/${note.id}`)).status, 404);
  assert.equal((await second.client.patch(`/api/notes/${note.id}`, { title: 'Hacked' })).status, 404);
  assert.equal((await second.client.del(`/api/notes/${note.id}`)).status, 404);

  const deleted = await user.client.del(`/api/notes/${note.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);
  assert.equal((await user.client.get(`/api/notes/${note.id}`)).status, 404);
});