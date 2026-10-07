import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'dashboard.test.local';
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

async function createHousehold(client, name = 'Dashboard Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

const FUTURE_MODULES = ['tasks', 'calendar', 'meals', 'shopping', 'inventory', 'finance'];

test('dashboard requires authentication', async () => {
  const anonymous = newClient(baseUrl);
  const response = await anonymous.get('/api/dashboard');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('dashboard is forbidden without an active household', async () => {
  const user = await createUser('no-household');
  const response = await user.client.get('/api/dashboard');
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
  assert.match(response.body.error.message, /household/i);
});

test('empty household reports diary empty and future modules as not_available', async () => {
  const owner = await createUser('empty');
  const created = await createHousehold(owner.client, 'Quiet House');

  const response = await owner.client.get('/api/dashboard');
  assert.equal(response.status, 200);
  const dashboard = response.body.data;

  assert.equal(dashboard.user.id.length > 0, true);
  assert.equal(dashboard.user.name, 'Test User');
  assert.equal(dashboard.user.email, owner.email);
  assert.equal(dashboard.user.emailVerified, false);
  assert.equal(dashboard.user.timezone, 'UTC');
  assert.deepEqual(dashboard.household, {
    id: created.household.id,
    name: 'Quiet House',
    role: 'OWNER',
    memberCount: 1,
  });
  assert.deepEqual(dashboard.diary, { status: 'empty', count: 0, recent: [] });

  for (const moduleName of FUTURE_MODULES) {
    assert.deepEqual(dashboard[moduleName], { status: 'not_available' });
  }
});

test('dashboard summarises recent diary entries without leaking content', async () => {
  const owner = await createUser('summary');
  await createHousehold(owner.client);

  for (let index = 0; index < 7; index += 1) {
    const response = await owner.client.post('/api/diary', {
      title: `Entry ${index}`,
      content: `Secret body number ${index}`,
      entryDate: `2026-09-${String(10 + index).padStart(2, '0')}`,
      mood: index % 2 === 0 ? 'happy' : 'tired',
      tags: ['Daily'],
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
  }

  const response = await owner.client.get('/api/dashboard');
  assert.equal(response.status, 200);
  const dashboard = response.body.data;

  assert.equal(dashboard.diary.status, 'available');
  assert.equal(dashboard.diary.count, 7);
  assert.equal(dashboard.diary.recent.length, 5);

  // Newest first, and the summary is metadata only — never entry bodies.
  assert.deepEqual(
    dashboard.diary.recent.map((entry) => entry.title),
    ['Entry 6', 'Entry 5', 'Entry 4', 'Entry 3', 'Entry 2'],
  );
  for (const entry of dashboard.diary.recent) {
    assert.equal(entry.content, undefined);
    assert.equal(entry.excerpt, undefined);
    assert.match(entry.entryDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.mood === null || typeof entry.mood.name === 'string');
    assert.equal(typeof entry.attachmentCount, 'number');
  }
  assert.deepEqual(dashboard.diary.recent[0].mood, { id: 'happy', name: 'Happy' });
});

test('dashboard reflects membership role for a second household member', async () => {
  const owner = await createUser('role-owner');
  const household = await createHousehold(owner.client, 'Shared House');

  const member = await createUser('role-member');
  const added = await owner.client.post(`/api/households/${household.household.id}/members`, {
    email: member.email,
    role: 'MEMBER',
  });
  assert.equal(added.status, 201);
  await member.client.post(`/api/households/${household.household.id}/switch`);

  const response = await member.client.get('/api/dashboard');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.household.role, 'MEMBER');
  assert.equal(response.body.data.household.name, 'Shared House');
  assert.equal(response.body.data.household.memberCount, 2);
  // The member's dashboard only counts their own diary, not the household's.
  assert.deepEqual(response.body.data.diary, { status: 'empty', count: 0, recent: [] });
});
