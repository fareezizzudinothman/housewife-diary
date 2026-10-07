import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { requireHousehold } from '../src/server/middleware/auth.js';
import { newClient, registerUser, uniqueEmail, TEST_PASSWORD } from './helpers/fixtures.js';

const DOMAIN = 'households.test.local';
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

async function createHousehold(client, name) {
  const response = await client.post('/api/households', { name });
  assert.equal(
    response.status,
    201,
    `household creation failed: ${JSON.stringify(response.body)}`,
  );
  return response.body.data;
}

async function getMembers(client, householdId) {
  const response = await client.get(`/api/households/${householdId}/members`);
  assert.equal(response.status, 200);
  return response.body.data.members;
}

// ---- Creation and ownership ----

test('creating a household makes the creator OWNER and sets it active', async () => {
  const owner = await createUser('owner-create');
  const created = await createHousehold(owner.client, 'The Lovelaces');

  assert.equal(created.role, 'OWNER');
  assert.equal(created.household.name, 'The Lovelaces');
  assert.equal(created.household.ownerUserId, owner.client ? created.household.ownerUserId : null);
  assert.equal(created.activeHouseholdId, created.household.id);

  const list = await owner.client.get('/api/households');
  assert.equal(list.status, 200);
  const households = list.body.data.households;
  assert.equal(households.length, 1);
  assert.equal(households[0].role, 'OWNER');
  assert.equal(households[0].isActive, true);
  assert.equal(households[0].memberCount, 1);

  const members = await getMembers(owner.client, created.household.id);
  assert.equal(members.length, 1);
  assert.equal(members[0].role, 'OWNER');
  assert.equal(members[0].isOwner, true);

  const session = await owner.client.get('/api/auth/session');
  assert.equal(session.body.data.user.activeHouseholdId, created.household.id);
});

test('household names are validated', async () => {
  const user = await createUser('bad-name');
  const empty = await user.client.post('/api/households', { name: '   ' });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, 'VALIDATION_ERROR');
  assert.equal(empty.body.error.details[0].field, 'name');
});

// ---- Membership ----

test('owners can add members by email; duplicates and unknown emails are handled', async () => {
  const owner = await createUser('add-owner');
  const invitee = await createUser('add-invitee');
  const created = await createHousehold(owner.client, 'Shared home');

  const added = await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: invitee.email,
    role: 'MEMBER',
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.data.member.role, 'MEMBER');

  // The new member can now see the household.
  const asInvitee = await invitee.client.get(`/api/households/${created.household.id}`);
  assert.equal(asInvitee.status, 200);
  assert.equal(asInvitee.body.data.household.id, created.household.id);

  const duplicate = await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: invitee.email,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');

  const unknown = await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: uniqueEmail(DOMAIN, 'nobody'),
  });
  assert.equal(unknown.status, 404);

  const badRole = await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: uniqueEmail(DOMAIN, 'roleprobe'),
    role: 'OWNER',
  });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.error.details[0].field, 'role');
});

test('owners can remove members; removed members lose access', async () => {
  const owner = await createUser('remove-owner');
  const member = await createUser('remove-member');
  const created = await createHousehold(owner.client, 'Removal home');
  await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: member.email,
    role: 'MEMBER',
  });

  const memberRow = (await getMembers(owner.client, created.household.id)).find(
    (row) => row.email === member.email,
  );

  const removed = await owner.client.del(
    `/api/households/${created.household.id}/members/${memberRow.userId}`,
  );
  assert.equal(removed.status, 200);

  const after = await member.client.get(`/api/households/${created.household.id}`);
  assert.equal(after.status, 404, 'removed members lose all access');
});

test('members can leave; the owner cannot leave without transferring', async () => {
  const owner = await createUser('leave-owner');
  const member = await createUser('leave-member');
  const created = await createHousehold(owner.client, 'Leaving home');
  await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: member.email,
    role: 'MEMBER',
  });

  // Make it the member's active household, then leave.
  await member.client.post(`/api/households/${created.household.id}/switch`);
  const activeBefore = await member.client.get('/api/auth/session');
  assert.equal(activeBefore.body.data.user.activeHouseholdId, created.household.id);

  const leave = await member.client.post(`/api/households/${created.household.id}/leave`);
  assert.equal(leave.status, 200);

  const session = await member.client.get('/api/auth/session');
  assert.equal(session.body.data.user.activeHouseholdId, null, 'active household cleared');
  assert.equal((await member.client.get(`/api/households/${created.household.id}`)).status, 404);

  const ownerLeave = await owner.client.post(`/api/households/${created.household.id}/leave`);
  assert.equal(ownerLeave.status, 409);
  assert.equal(ownerLeave.body.error.code, 'CONFLICT');
  assert.match(ownerLeave.body.error.message, /transfer/i);
});

// ---- Roles ----

test('role authorization: viewer is read-only, member cannot manage', async () => {
  const owner = await createUser('matrix-owner');
  const created = await createHousehold(owner.client, 'Matrix home');
  const target = await createUser('matrix-target');

  // Viewer
  const viewer = await createUser('matrix-viewer');
  await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: viewer.email,
    role: 'VIEWER',
  });
  assert.equal((await viewer.client.get(`/api/households/${created.household.id}`)).status, 200);
  assert.equal(
    (await viewer.client.get(`/api/households/${created.household.id}/members`)).status,
    200,
  );
  const viewerAdd = await viewer.client.post(`/api/households/${created.household.id}/members`, {
    email: target.email,
  });
  assert.equal(viewerAdd.status, 403);
  assert.equal(viewerAdd.body.error.code, 'FORBIDDEN');
  const ownerRow = (await getMembers(owner.client, created.household.id)).find((m) => m.isOwner);
  const viewerPatch = await viewer.client.patch(
    `/api/households/${created.household.id}/members/${ownerRow.userId}`,
    { role: 'MEMBER' },
  );
  assert.equal(viewerPatch.status, 403);
  const viewerRemove = await viewer.client.del(
    `/api/households/${created.household.id}/members/${ownerRow.userId}`,
  );
  assert.equal(viewerRemove.status, 403);

  // Member
  const member = await createUser('matrix-member');
  await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: member.email,
    role: 'MEMBER',
  });
  assert.equal(
    (await member.client.post(`/api/households/${created.household.id}/members`, {
      email: target.email,
    })).status,
    403,
  );
  assert.equal(
    (
      await member.client.patch(
        `/api/households/${created.household.id}/members/${ownerRow.userId}`,
        { role: 'VIEWER' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await member.client.del(`/api/households/${created.household.id}/members/${ownerRow.userId}`))
      .status,
    403,
  );
  // But a member can still leave.
  assert.equal(
    (await member.client.post(`/api/households/${created.household.id}/leave`)).status,
    200,
  );
});

test('admins can manage members but cannot grant admin or touch admins/owner', async () => {
  const owner = await createUser('admin-owner');
  const created = await createHousehold(owner.client, 'Admin home');
  const admin = await createUser('admin-admin');
  const member = await createUser('admin-member');
  const otherAdmin = await createUser('admin-second');
  const target = await createUser('admin-target');

  for (const [user, role] of [
    [admin, 'ADMIN'],
    [member, 'MEMBER'],
    [otherAdmin, 'ADMIN'],
  ]) {
    const response = await owner.client.post(`/api/households/${created.household.id}/members`, {
      email: user.email,
      role,
    });
    assert.equal(response.status, 201, `adding ${role} failed`);
  }

  // Admin adds a plain member.
  const added = await admin.client.post(`/api/households/${created.household.id}/members`, {
    email: target.email,
    role: 'MEMBER',
  });
  assert.equal(added.status, 201);

  // Admin cannot grant ADMIN.
  const grantAdmin = await admin.client.post(`/api/households/${created.household.id}/members`, {
    email: uniqueEmail(DOMAIN, 'promote-probe'),
    role: 'ADMIN',
  });
  assert.equal(grantAdmin.status, 403);

  // Admin can change MEMBER -> VIEWER.
  const targetRow = (await getMembers(owner.client, created.household.id)).find(
    (row) => row.email === target.email,
  );
  const downgrade = await admin.client.patch(
    `/api/households/${created.household.id}/members/${targetRow.userId}`,
    { role: 'VIEWER' },
  );
  assert.equal(downgrade.status, 200);

  // Admin cannot promote to ADMIN.
  const promote = await admin.client.patch(
    `/api/households/${created.household.id}/members/${targetRow.userId}`,
    { role: 'ADMIN' },
  );
  assert.equal(promote.status, 403);

  const ownerRow = (await getMembers(owner.client, created.household.id)).find((row) => row.isOwner);
  // Admin cannot touch the owner.
  assert.equal(
    (
      await admin.client.patch(
        `/api/households/${created.household.id}/members/${ownerRow.userId}`,
        { role: 'MEMBER' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await admin.client.del(`/api/households/${created.household.id}/members/${ownerRow.userId}`))
      .status,
    403,
  );
  // Admin cannot remove another admin.
  const otherRow = (await getMembers(owner.client, created.household.id)).find(
    (row) => row.email === otherAdmin.email,
  );
  assert.equal(
    (await admin.client.del(`/api/households/${created.household.id}/members/${otherRow.userId}`))
      .status,
    403,
  );
  // Admin CAN remove a viewer.
  assert.equal(
    (await admin.client.del(`/api/households/${created.household.id}/members/${targetRow.userId}`))
      .status,
    200,
  );

  // Owner can grant ADMIN to a real, existing user.
  const grantTarget = await createUser('admin-grant');
  const ownerGrant = await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: grantTarget.email,
    role: 'ADMIN',
  });
  assert.equal(ownerGrant.status, 201);
  const granted = await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: target.email, // removed above → re-add ok
    role: 'ADMIN',
  });
  assert.equal(granted.status, 201);
});

test('ownership transfer demotes the previous owner and updates the household owner', async () => {
  const first = await createUser('transfer-first');
  const created = await createHousehold(first.client, 'Transfer home');
  const successor = await createUser('transfer-second');
  await first.client.post(`/api/households/${created.household.id}/members`, {
    email: successor.email,
    role: 'MEMBER',
  });
  const successorRow = (await getMembers(first.client, created.household.id)).find(
    (row) => row.email === successor.email,
  );

  // Only the owner may transfer.
  const byMember = await successor.client.patch(
    `/api/households/${created.household.id}/members/${(await getMembers(first.client, created.household.id)).find((row) => row.email === first.email).userId}`,
    { role: 'OWNER' },
  );
  assert.equal(byMember.status, 403);

  const transfer = await first.client.patch(
    `/api/households/${created.household.id}/members/${successorRow.userId}`,
    { role: 'OWNER' },
  );
  assert.equal(transfer.status, 200);
  assert.equal(transfer.body.data.household.ownerUserId, successorRow.userId);

  const members = await getMembers(successor.client, created.household.id);
  const newOwner = members.find((row) => row.userId === successorRow.userId);
  const oldOwner = members.find((row) => row.email === first.email);
  assert.equal(newOwner.role, 'OWNER');
  assert.equal(oldOwner.role, 'ADMIN');

  // Owner cannot transfer to themselves.
  const selfTransfer = await successor.client.patch(
    `/api/households/${created.household.id}/members/${successorRow.userId}`,
    { role: 'OWNER' },
  );
  assert.equal(selfTransfer.status, 409);

  // The new owner can now change the old owner's role.
  const demote = await successor.client.patch(
    `/api/households/${created.household.id}/members/${oldOwner.userId}`,
    { role: 'MEMBER' },
  );
  assert.equal(demote.status, 200);
});

// ---- Isolation ----

test('cross-household access returns 404 on every household endpoint', async () => {
  const alice = await createUser('iso-alice');
  const carol = await createUser('iso-carol');
  const aliceHousehold = await createHousehold(alice.client, 'Alice home');
  const carolHousehold = await createHousehold(carol.client, 'Carol home');
  const carolUserId = (
    await getMembers(carol.client, carolHousehold.household.id)
  )[0].userId;

  const h2 = carolHousehold.household.id;
  const probes = [
    alice.client.get(`/api/households/${h2}`),
    alice.client.get(`/api/households/${h2}/members`),
    alice.client.post(`/api/households/${h2}/switch`),
    alice.client.post(`/api/households/${h2}/leave`),
    alice.client.post(`/api/households/${h2}/members`, { email: uniqueEmail(DOMAIN, 'x') }),
    alice.client.patch(`/api/households/${h2}/members/${carolUserId}`, { role: 'VIEWER' }),
    alice.client.del(`/api/households/${h2}/members/${carolUserId}`),
  ];
  for (const probe of await Promise.all(probes)) {
    assert.equal(probe.status, 404, `expected 404, got ${probe.status}`);
    assert.equal(probe.body.error.code, 'NOT_FOUND');
  }

  // Setting another household as active is also rejected.
  const active = await carol.client.patch('/api/users/me', {
    activeHouseholdId: aliceHousehold.household.id,
  });
  assert.equal(active.status, 404);

  // And the cross-household id does not appear in listings.
  const carolList = await carol.client.get('/api/households');
  assert.ok(
    carolList.body.data.households.every((h) => h.householdId !== aliceHousehold.household.id),
  );
});

test('switching the active household requires membership', async () => {
  const owner = await createUser('switch-owner');
  const first = await createHousehold(owner.client, 'First home');
  const second = await createHousehold(owner.client, 'Second home');

  const switched = await owner.client.post(`/api/households/${second.household.id}/switch`);
  assert.equal(switched.status, 200);
  assert.equal(switched.body.data.activeHouseholdId, second.household.id);

  const session = await owner.client.get('/api/auth/session');
  assert.equal(session.body.data.user.activeHouseholdId, second.household.id);

  const missing = await owner.client.post('/api/households/some-missing-id/switch');
  assert.equal(missing.status, 404);
  assert.ok(first.household.id);
});

// ---- Middleware ----

test('requireHousehold resolves the active membership and enforces roles', async () => {
  const owner = await createUser('mw-owner');
  const created = await createHousehold(owner.client, 'Middleware home');
  const viewer = await createUser('mw-viewer');
  await owner.client.post(`/api/households/${created.household.id}/members`, {
    email: viewer.email,
    role: 'VIEWER',
  });
  await viewer.client.post(`/api/households/${created.household.id}/switch`);

  const ownerSession = (await owner.client.get('/api/auth/session')).body.data;
  const viewerSession = (await viewer.client.get('/api/auth/session')).body.data;

  const run = (middleware, req) =>
    new Promise((resolve) => middleware(req, {}, (error) => resolve(error)));

  // Resolves owner's active household.
  const ownerReq = { user: ownerSession.user };
  const ownerError = await run(requireHousehold(), ownerReq);
  assert.equal(ownerError, undefined);
  assert.equal(ownerReq.householdId, created.household.id);
  assert.equal(ownerReq.householdRole, 'OWNER');

  // Viewer passes a plain requireHousehold but fails a role gate.
  const viewerReq = { user: viewerSession.user };
  assert.equal(await run(requireHousehold(), viewerReq), undefined);
  assert.equal(viewerReq.householdRole, 'VIEWER');

  const gated = { user: viewerSession.user };
  const gateError = await run(requireHousehold('ADMIN'), gated);
  assert.ok(gateError);
  assert.equal(gateError.status, 403);

  // No user → 401; no active household → 403.
  const anonymousError = await run(requireHousehold(), {});
  assert.ok(anonymousError);
  assert.equal(anonymousError.status, 401);

  const noActive = await run(requireHousehold(), { user: { id: viewerSession.user.id } });
  assert.ok(noActive);
  assert.equal(noActive.status, 403);

  // Stale active household (membership removed) → 403.
  await owner.client.del(
    `/api/households/${created.household.id}/members/${viewerSession.user.id}`,
  );
  const stale = await run(requireHousehold(), { user: viewerSession.user });
  assert.ok(stale);
  assert.equal(stale.status, 403);
});

// ---- Unauthenticated access ----

test('household endpoints require an authenticated session', async () => {
  const anonymous = newClient(baseUrl);
  await anonymous.ensureCsrf();

  for (const probe of [
    anonymous.get('/api/households'),
    anonymous.post('/api/households', { name: 'Nope' }),
    anonymous.get('/api/households/anything/members'),
  ]) {
    const response = await probe;
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  }
});
