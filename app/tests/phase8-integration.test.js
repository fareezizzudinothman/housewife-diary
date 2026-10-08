import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'phase8.test.local';
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

async function createHousehold(client, name = 'Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.household;
}

test('family events and birthdays appear on the calendar', async () => {
  const user = await createUser('cal-family');
  await createHousehold(user.client);

  const member = await user.client.post('/api/family/members', {
    name: 'Aisha',
    relationship: 'Wife',
    dateOfBirth: '1992-04-12',
  });
  assert.equal(member.status, 201);

  const event = await user.client.post('/api/family/events', {
    title: 'School concert',
    kind: 'School event',
    eventDate: '2026-12-01',
    memberId: member.body.data.member.id,
  });
  assert.equal(event.status, 201);

  const calendar = await user.client.get('/api/calendar?from=2026-04-01&to=2026-12-31');
  assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
  const items = calendar.body.data.events;

  const familyEvent = items.find((item) => item.sourceType === 'FAMILY' && item.sourceId === event.body.data.event.id);
  assert.ok(familyEvent, 'family event should appear on calendar');
  assert.equal(familyEvent.title, 'School concert');
  assert.equal(familyEvent.allDay, true);
  assert.equal(familyEvent.category, 'School event');
  assert.equal(familyEvent.family.name, 'Aisha');

  const birthday = items.find(
    (item) => item.sourceType === 'FAMILY' && item.title === "Aisha's birthday",
  );
  assert.ok(birthday, 'Birthday should appear on calendar');
  assert.equal(birthday.category, 'Birthday');
  assert.equal(birthday.allDay, true);
  assert.ok(birthday.startAt.startsWith('2026-04-12'), `Expected 2026-04-12, got ${birthday.startAt}`);
});

test('maintenance jobs appear on the calendar', async () => {
  const user = await createUser('cal-maintenance');
  await createHousehold(user.client);

  const room = await user.client.post('/api/home/rooms', { name: 'Kitchen' });
  assert.equal(room.status, 201);

  const job = await user.client.post('/api/home/maintenance', {
    roomId: room.body.data.room.id,
    title: 'Fix leaking tap',
    category: 'Plumbing',
    scheduledDate: '2026-11-15',
  });
  assert.equal(job.status, 201);

  const calendar = await user.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  assert.equal(calendar.status, 200, JSON.stringify(calendar.body));
  const items = calendar.body.data.events;

  const maintenance = items.find(
    (item) => item.sourceType === 'MAINTENANCE' && item.sourceId === job.body.data.maintenance.id,
  );
  assert.ok(maintenance, 'Maintenance should appear on calendar');
  assert.equal(maintenance.title, 'Fix leaking tap');
  assert.equal(maintenance.allDay, true);
  assert.equal(maintenance.category, 'Plumbing');
  assert.equal(maintenance.maintenance.room.name, 'Kitchen');
  assert.ok(maintenance.startAt.startsWith('2026-11-15'));
});

test('calendar derived items respect household isolation', async () => {
  const user = await createUser('cal-iso-1');
  await createHousehold(user.client);

  const member = await user.client.post('/api/family/members', {
    name: 'Private Person',
    relationship: 'Family',
    dateOfBirth: '1990-01-15',
  });
  await user.client.post('/api/family/events', {
    title: 'Private event',
    kind: 'Other',
    eventDate: '2026-11-20',
    memberId: member.body.data.member.id,
  });

  const room = await user.client.post('/api/home/rooms', { name: 'Private Room' });
  await user.client.post('/api/home/maintenance', {
    roomId: room.body.data.room.id,
    title: 'Private job',
    scheduledDate: '2026-11-25',
  });

  const stranger = await createUser('cal-iso-2');
  await createHousehold(stranger.client);

  const calendar = await stranger.client.get('/api/calendar?from=2026-11-01&to=2026-11-30');
  assert.equal(calendar.status, 200);
  const items = calendar.body.data.events;
  assert.equal(items.filter((item) => item.sourceType === 'FAMILY').length, 0);
  assert.equal(items.filter((item) => item.sourceType === 'MAINTENANCE').length, 0);
});

test('dashboard shows family information', async () => {
  const user = await createUser('dash-family');
  await createHousehold(user.client);

  await user.client.post('/api/family/members', {
    name: 'Aisha',
    relationship: 'Wife',
    dateOfBirth: '1992-04-12',
  });
  await user.client.post('/api/family/members', {
    name: 'Noah',
    relationship: 'Son',
    dateOfBirth: '2018-06-15',
  });

  const event = await user.client.post('/api/family/events', {
    title: 'School concert',
    kind: 'School event',
    eventDate: '2026-10-14',
  });
  assert.equal(event.status, 201);

  const dashboard = await user.client.get('/api/dashboard');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  const family = dashboard.body.data.family;

  assert.equal(family.memberCount, 2);
  assert.equal(family.status, 'available');
  assert.ok(family.upcomingBirthdays.length > 0, 'Should have upcoming birthdays');
  assert.ok(family.upcomingBirthdays.some((b) => b.name === 'Aisha'));
  assert.ok(family.upcomingBirthdays.some((b) => b.name === 'Noah'));
  assert.equal(family.nextEvent.title, 'School concert');
  assert.equal(family.nextEvent.date, '2026-10-14');
});

test('dashboard shows home information', async () => {
  const user = await createUser('dash-home');
  await createHousehold(user.client);

  const room = await user.client.post('/api/home/rooms', { name: 'Kitchen' });
  assert.equal(room.status, 201);

  await user.client.post('/api/home/maintenance', {
    roomId: room.body.data.room.id,
    title: 'Overdue job',
    category: 'Plumbing',
    scheduledDate: '2026-10-01',
  });
  await user.client.post('/api/home/maintenance', {
    roomId: room.body.data.room.id,
    title: 'Upcoming job',
    category: 'Electrical',
    scheduledDate: '2026-10-14',
  });

  await user.client.post('/api/home/cleaning', {
    roomId: room.body.data.room.id,
    title: 'Clean kitchen',
    frequency: 'WEEKLY',
  });

  await user.client.post('/api/home/laundry', {
    category: 'Clothes',
    scheduledDate: '2026-10-10',
  });

  const dashboard = await user.client.get('/api/dashboard');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  const home = dashboard.body.data.home;

  assert.equal(home.overdueMaintenanceCount, 1);
  assert.equal(home.upcomingMaintenance.length, 1);
  assert.equal(home.upcomingMaintenance[0].title, 'Upcoming job');
  assert.equal(home.dueCleaningCount > 0, true, 'Should have due cleaning');
  assert.equal(home.laundry.pending, 1);
  assert.equal(home.expiringDocumentCount, 0);
});

test('dashboard home section is empty when no data exists', async () => {
  const user = await createUser('dash-empty');
  await createHousehold(user.client);

  const dashboard = await user.client.get('/api/dashboard');
  assert.equal(dashboard.status, 200);
  const home = dashboard.body.data.home;

  assert.equal(home.status, 'empty');
  assert.equal(home.overdueMaintenanceCount, 0);
  assert.equal(home.upcomingMaintenance.length, 0);
  assert.equal(home.dueCleaningCount, 0);
  assert.equal(home.expiringDocumentCount, 0);
  assert.equal(home.laundry.pending, 0);
});

test('dashboard and calendar require authentication', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/dashboard')).status, 401);
  assert.equal((await anonymous.get('/api/calendar?from=2026-11-01&to=2026-11-30')).status, 401);

  const user = await createUser('auth-check');
  assert.equal((await user.client.get('/api/dashboard')).status, 403);
  assert.equal((await user.client.get('/api/calendar?from=2026-11-01&to=2026-11-30')).status, 403);
});