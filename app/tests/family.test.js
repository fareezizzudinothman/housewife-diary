import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'family.test.local';
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
  const registered = await registerUser(client, { domain: DOMAIN, label });
  return { client, email: registered.email, user: registered.user };
}

async function createHousehold(client, name = 'Family Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

async function createMember(client, data = {}) {
  const response = await client.post('/api/family/members', {
    name: 'Aisha',
    relationship: 'Wife',
    dateOfBirth: '1992-04-12',
    notes: 'Loves cooking',
    ...data,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.member;
}

test('family endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/family/members')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/family/members')).status, 403);
  assert.equal((await user.client.get('/api/family/events')).status, 403);
});

test('family members support create, get, list and search', async () => {
  const owner = await createUser('member-crud');
  await createHousehold(owner.client);

  const member = await createMember(owner.client);
  assert.equal(member.name, 'Aisha');
  assert.equal(member.relationship, 'Wife');
  assert.equal(member.dateOfBirth, '1992-04-12');
  assert.equal(member.active, true);
  assert.equal(member.linkedUser, null);

  const fetched = await owner.client.get(`/api/family/members/${member.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.id, member.id);

  const list = await owner.client.get('/api/family/members');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.total, 1);
  assert.equal(list.body.data.items[0].name, 'Aisha');

  const searched = await owner.client.get('/api/family/members?search=aish');
  assert.equal(searched.body.data.total, 1);

  const missing = await owner.client.get('/api/family/members?search=nobody');
  assert.equal(missing.body.data.total, 0);
});

test('family member names are case-insensitively unique', async () => {
  const owner = await createUser('member-unique');
  await createHousehold(owner.client);
  await createMember(owner.client, { name: 'Adam' });

  const duplicate = await owner.client.post('/api/family/members', {
    name: 'adam',
    relationship: 'Husband',
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');
  assert.equal(duplicate.body.error.details[0].field, 'name');
});

test('family members can be linked to a household user only', async () => {
  const owner = await createUser('member-link');
  await createHousehold(owner.client);

  const meta = await owner.client.get('/api/family/meta');
  assert.equal(meta.status, 200);
  const members = meta.body.data.linkedUsers;
  assert.equal(members.length, 1);
  assert.equal(members[0].name, 'Test User');

  const withLink = await createMember(owner.client, { name: 'Me', linkedUserId: members[0].id });
  assert.equal(withLink.linkedUserId, members[0].id);
  assert.equal(withLink.linkedUser.name, 'Test User');

  // A user from outside the household is rejected.
  const outsider = await createUser('member-link-outsider');
  await createHousehold(outsider.client, 'Elsewhere');
  const foreign = await owner.client.post('/api/family/members', {
    name: 'Foreign',
    relationship: 'Other',
    linkedUserId: outsider.user.id,
  });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.body.error.details[0].field, 'linkedUserId');
});

test('family members update cleanly, including clearing optional fields', async () => {
  const owner = await createUser('member-update');
  await createHousehold(owner.client);
  const member = await createMember(owner.client);

  const updated = await owner.client.patch(`/api/family/members/${member.id}`, {
    relationship: 'Partner',
    notes: null,
    dateOfBirth: null,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.member.relationship, 'Partner');
  assert.equal(updated.body.data.member.notes, null);
  assert.equal(updated.body.data.member.dateOfBirth, null);

  const renamed = await owner.client.patch(`/api/family/members/${member.id}`, { name: 'Aisha B.' });
  assert.equal(renamed.body.data.member.name, 'Aisha B.');

  // Empty PATCH is rejected.
  const empty = await owner.client.patch(`/api/family/members/${member.id}`, {});
  assert.equal(empty.status, 400);
});

test('archiving hides a family member; includeArchived brings them back', async () => {
  const owner = await createUser('member-archive');
  await createHousehold(owner.client);
  const member = await createMember(owner.client);

  const archived = await owner.client.del(`/api/family/members/${member.id}`);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.data.member.active, false);

  const list = await owner.client.get('/api/family/members');
  assert.equal(list.body.data.total, 0);

  const hidden = await owner.client.get(`/api/family/members/${member.id}`);
  assert.equal(hidden.body.data.active, false);

  const withArchived = await owner.client.get('/api/family/members?includeArchived=true');
  assert.equal(withArchived.body.data.total, 1);

  // Archives are idempotent.
  const again = await owner.client.del(`/api/family/members/${member.id}`);
  assert.equal(again.body.data.member.active, false);

  // Unarchive via PATCH restores visibility.
  const restored = await owner.client.patch(`/api/family/members/${member.id}`, { active: true });
  assert.equal(restored.body.data.member.active, true);
  assert.equal((await owner.client.get('/api/family/members')).body.data.total, 1);
});

test('family events support create, range list, update and delete', async () => {
  const owner = await createUser('event-crud');
  await createHousehold(owner.client);
  const member = await createMember(owner.client);

  const created = await owner.client.post('/api/family/events', {
    title: 'School concert',
    kind: 'School event',
    eventDate: '2026-12-01',
    memberId: member.id,
    repeatsYearly: true,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.event.kind, 'School event');
  assert.equal(created.body.data.event.repeatsYearly, true);
  assert.equal(created.body.data.event.member.name, 'Aisha');

  const list = await owner.client.get('/api/family/events?from=2026-11-01&to=2026-12-31');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.total, 1);

  const outside = await owner.client.get('/api/family/events?from=2027-01-01&to=2027-12-31');
  assert.equal(outside.body.data.total, 0);

  const invalidRange = await owner.client.get('/api/family/events?from=2027-12-31&to=2026-01-01');
  assert.equal(invalidRange.status, 400);

  const patched = await owner.client.patch(`/api/family/events/${created.body.data.event.id}`, {
    title: 'Winter concert',
    repeatsYearly: false,
  });
  assert.equal(patched.body.data.event.title, 'Winter concert');
  assert.equal(patched.body.data.event.repeatsYearly, false);

  const deleted = await owner.client.del(`/api/family/events/${created.body.data.event.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);

  const gone = await owner.client.get(`/api/family/events/${created.body.data.event.id}`);
  assert.equal(gone.status, 404);
});

test('family events require a valid member and valid dates', async () => {
  const owner = await createUser('event-validate');
  await createHousehold(owner.client);

  const badMember = await owner.client.post('/api/family/events', {
    title: 'Party',
    kind: 'Important',
    eventDate: '2026-06-01',
    memberId: 'does-not-exist',
  });
  assert.equal(badMember.status, 400);
  assert.equal(badMember.body.error.details[0].field, 'memberId');

  const badDate = await owner.client.post('/api/family/events', {
    title: 'Party',
    kind: 'Important',
    eventDate: 'not-a-date',
  });
  assert.equal(badDate.status, 400);

  const noTitle = await owner.client.post('/api/family/events', {
    title: '',
    kind: 'Important',
    eventDate: '2026-06-01',
  });
  assert.equal(noTitle.status, 400);
});

test('family records are isolated between households', async () => {
  const first = await createUser('iso-a');
  await createHousehold(first.client, 'House A');
  const secondUser = await createUser('iso-b');
  await createHousehold(secondUser.client, 'House B');

  const memberA = await createMember(first.client, { name: 'Owner A' });
  const memberB = await createMember(secondUser.client, { name: 'Owner B' });

  // Cross-household reads, patches and deletes all 404.
  const read = await first.client.get(`/api/family/members/${memberB.id}`);
  assert.equal(read.status, 404);
  const patch = await first.client.patch(`/api/family/members/${memberB.id}`, { name: 'Hacked' });
  assert.equal(patch.status, 404);
  const del = await first.client.del(`/api/family/members/${memberB.id}`);
  assert.equal(del.status, 404);

  const listA = await first.client.get('/api/family/members');
  assert.equal(listA.body.data.total, 1);
  assert.equal(listA.body.data.items[0].id, memberA.id);

  // Events isolated too.
  const eventB = await secondUser.client.post('/api/family/events', {
    title: 'Secret B event',
    kind: 'Important',
    eventDate: '2026-08-08',
  });
  assert.equal(eventB.status, 201);
  const eventsA = await first.client.get('/api/family/events?from=2026-01-01&to=2027-12-31');
  assert.equal(eventsA.body.data.total, 0);
  const gone = await first.client.del(`/api/family/events/${eventB.body.data.id}`);
  assert.equal(gone.status, 404);
});

test('tasks can be assigned to a family member instead of an app user', async () => {
  const owner = await createUser('family-task');
  await createHousehold(owner.client);
  const member = await createMember(owner.client, { name: 'Aman', relationship: 'Child' });

  const created = await owner.client.post('/api/tasks', {
    title: 'Clean the room',
    assignedFamilyMemberId: member.id,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.task.familyAssignee.id, member.id);
  assert.equal(created.body.data.task.assignee, null);
  assert.equal(created.body.data.task.source, null);

  // App-assigned and family-assigned cannot coexist.
  const meta = await owner.client.get('/api/family/meta');
  const linkedUserId = meta.body.data.linkedUsers[0].id;
  const both = await owner.client.post('/api/tasks', {
    title: 'Ambiguous',
    assignedToId: linkedUserId,
    assignedFamilyMemberId: member.id,
  });
  assert.equal(both.status, 400);
  assert.match(both.body.error.details[0].message, /not both/);

  // Clearing the family assignment works.
  const cleared = await owner.client.patch(`/api/tasks/${created.body.data.task.id}`, {
    assignedFamilyMemberId: null,
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.task.familyAssignee, null);

  // Archived members cannot be assigned.
  await owner.client.del(`/api/family/members/${member.id}`);
  const forbidden = await owner.client.post('/api/tasks', {
    title: 'Ghost task',
    assignedFamilyMemberId: member.id,
  });
  assert.equal(forbidden.status, 400);
});