import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain, findUserByEmail, prisma } from './helpers/db.js';
import { hashToken } from '../src/server/utils/tokens.js';
import { newClient, registerUser, loginUser, uniqueEmail, TEST_PASSWORD } from './helpers/fixtures.js';

const DOMAIN = 'auth.test.local';
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

function sessionCookieOf(client) {
  return client.cookies.get('hd_session');
}

test('successful registration creates a verified-less user and an auto-login session', async () => {
  const client = newClient(baseUrl);
  const email = uniqueEmail(DOMAIN, 'register');
  const response = await client.post('/api/auth/register', {
    name: 'Ada Lovelace',
    email: email.toUpperCase(), // must be normalized to lowercase
    password: TEST_PASSWORD,
    timezone: 'Europe/London',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  const { user } = response.body.data;
  assert.equal(user.email, email);
  assert.equal(user.name, 'Ada Lovelace');
  assert.equal(user.timezone, 'Europe/London');
  assert.equal(user.emailVerifiedAt, null);

  // No secrets in the payload.
  const rawBody = JSON.stringify(response.body);
  assert.ok(!rawBody.includes('passwordHash'), 'password hash must not be returned');
  assert.ok(!rawBody.includes('$2b$'), 'bcrypt hash must not be returned');

  // Secure cookie flags.
  const setCookie = response.headers.getSetCookie().join('\n');
  assert.match(setCookie, /hd_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=lax/i);
  assert.match(setCookie, /Path=\//);
  assert.ok(!/; ?Secure/i.test(setCookie), 'secure flag only in production');
  assert.match(setCookie, /Max-Age=86400/); // short session (1 day)

  // Auto-login works immediately.
  const session = await client.get('/api/auth/session');
  assert.equal(session.status, 200);
  assert.equal(session.body.data.user.email, email);
  assert.equal(session.body.data.session.current, true);
  assert.ok(Array.isArray(session.body.data.households));
});

test('duplicate email registration returns 409 CONFLICT', async () => {
  const client = newClient(baseUrl);
  const email = uniqueEmail(DOMAIN, 'dupe');
  const first = await client.post('/api/auth/register', {
    name: 'First',
    email,
    password: TEST_PASSWORD,
  });
  assert.equal(first.status, 201);

  const second = newClient(baseUrl);
  const duplicate = await second.post('/api/auth/register', {
    name: 'Second',
    email,
    password: TEST_PASSWORD,
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');
});

test('registration validates email, password policy and name', async () => {
  const client = newClient(baseUrl);

  const badEmail = await client.post('/api/auth/register', {
    name: 'No Email',
    email: 'not-an-email',
    password: TEST_PASSWORD,
  });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.error.code, 'VALIDATION_ERROR');
  assert.equal(badEmail.body.error.details[0].field, 'email');

  const shortPassword = await client.post('/api/auth/register', {
    name: 'Short',
    email: uniqueEmail(DOMAIN, 'short'),
    password: 'short123',
  });
  assert.equal(shortPassword.status, 400);
  assert.ok(shortPassword.body.error.details.some((detail) => detail.field === 'password'));

  const commonPassword = await client.post('/api/auth/register', {
    name: 'Common',
    email: uniqueEmail(DOMAIN, 'common'),
    password: 'password123',
  });
  assert.equal(commonPassword.status, 400);
  const detail = commonPassword.body.error.details.find((d) => d.field === 'password');
  assert.match(detail.message, /too common/i);

  const emptyName = await client.post('/api/auth/register', {
    name: '   ',
    email: uniqueEmail(DOMAIN, 'noname'),
    password: TEST_PASSWORD,
  });
  assert.equal(emptyName.status, 400);
  assert.ok(emptyName.body.error.details.some((d) => d.field === 'name'));

  // None of these should have created accounts.
  assert.equal(await findUserByEmail('not-an-email'), null);
});

test('login success returns a session cookie; remember me extends expiry', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'login-ok' });

  const logoutResponse = await client.post('/api/auth/logout');
  assert.equal(logoutResponse.status, 200);

  const login = await loginUser(client, email);
  assert.equal(login.status, 200);
  assert.equal(login.body.data.user.email, email);
  const setCookie = login.headers.getSetCookie().join('\n');
  assert.match(setCookie, /hd_session=/);
  assert.match(setCookie, /Max-Age=86400/);

  const rememberClient = newClient(baseUrl);
  const remember = await rememberClient.post('/api/auth/login', {
    email,
    password: TEST_PASSWORD,
    rememberMe: true,
  });
  assert.equal(remember.status, 200);
  assert.match(remember.headers.getSetCookie().join('\n'), /Max-Age=2592000/);
});

test('login failures are uniform for wrong password and unknown email', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'login-fail' });

  const wrongPassword = await loginUser(client, email, 'wrong-password-123');
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.error.code, 'UNAUTHORIZED');

  const unknownEmail = await loginUser(client, uniqueEmail(DOMAIN, 'ghost'), TEST_PASSWORD);
  assert.equal(unknownEmail.status, 401);
  assert.equal(unknownEmail.body.error.code, 'UNAUTHORIZED');

  // Identical message — no account enumeration.
  assert.equal(wrongPassword.body.error.message, unknownEmail.body.error.message);
  assert.equal(wrongPassword.body.error.message, 'Invalid email or password.');
});

test('logout revokes the session server-side and clears the cookie', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'logout' });
  const rawToken = sessionCookieOf(client);
  assert.ok(rawToken);

  const logout = await client.post('/api/auth/logout');
  assert.equal(logout.status, 200);
  const cleared = logout.headers.getSetCookie().join('\n');
  assert.match(cleared, /hd_session=;/);
  assert.match(cleared, /Max-Age=0/);

  // The raw token no longer resolves to a session (server-side revocation).
  client.setCookie('hd_session', rawToken);
  const afterLogout = await client.get('/api/auth/session');
  assert.equal(afterLogout.status, 401);
  assert.equal(afterLogout.body.error.code, 'UNAUTHORIZED');
  assert.ok(email);
});

test('protected endpoints reject missing and invalid session cookies', async () => {
  const anonymous = newClient(baseUrl);
  const missing = await anonymous.get('/api/auth/session');
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'UNAUTHORIZED');

  const invalid = newClient(baseUrl);
  invalid.setCookie('hd_session', 'not-a-real-session-token');
  const bogus = await invalid.get('/api/users/me');
  assert.equal(bogus.status, 401);
  assert.equal(bogus.body.error.code, 'UNAUTHORIZED');
});

test('expired sessions are rejected and cleaned up', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'expired' });
  const user = await findUserByEmail(email);
  assert.ok(user);

  const rawToken = 'expired-test-session-token';
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000),
      rememberMe: false,
    },
  });

  const expiredClient = newClient(baseUrl);
  expiredClient.setCookie('hd_session', rawToken);
  const response = await expiredClient.get('/api/auth/session');
  assert.equal(response.status, 401);

  const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  assert.equal(row, null, 'expired session row should be deleted');
});

test('unsafe methods without a CSRF token are rejected', async () => {
  const client = newClient(baseUrl);
  const email = uniqueEmail(DOMAIN, 'csrf');
  await client.post('/api/auth/register', { name: 'CSRF', email, password: TEST_PASSWORD });

  const forged = await client.post(
    '/api/auth/change-password',
    { currentPassword: TEST_PASSWORD, newPassword: 'a brand new passphrase' },
    { csrf: false },
  );
  assert.equal(forged.status, 403);
  assert.equal(forged.body.error.code, 'FORBIDDEN');
  assert.match(forged.body.error.message, /csrf/i);

  // With the token the same request works.
  const proper = await client.post('/api/auth/change-password', {
    currentPassword: TEST_PASSWORD,
    newPassword: 'a brand new passphrase',
  });
  assert.equal(proper.status, 200);
});

test('missing session with valid CSRF returns 401 not 403', async () => {
  const client = newClient(baseUrl);
  await client.ensureCsrf();
  const response = await client.post('/api/auth/change-password', {
    currentPassword: 'whatever123',
    newPassword: 'another passphrase',
  });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('repeated failed logins trigger RATE_LIMITED with Retry-After', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'lockout' });

  let last;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = await loginUser(client, email, 'definitely-wrong-pass');
    assert.equal(last.status, 401, `attempt ${attempt + 1} should be 401`);
  }

  const locked = await loginUser(client, email, 'definitely-wrong-pass');
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, 'RATE_LIMITED');
  assert.ok(locked.headers.get('retry-after'), 'Retry-After header required');

  // Even the correct password is refused while locked out.
  const stillLocked = await loginUser(client, email, TEST_PASSWORD);
  assert.equal(stillLocked.status, 429);
});

test('GET /api/users/me returns the profile and PATCH updates it', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'profile' });

  const me = await client.get('/api/users/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, email);
  assert.ok(Array.isArray(me.body.data.households));
  assert.ok(!JSON.stringify(me.body).includes('passwordHash'));

  const updated = await client.patch('/api/users/me', {
    name: 'Renamed Person',
    timezone: 'Asia/Tokyo',
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.user.name, 'Renamed Person');
  assert.equal(updated.body.data.user.timezone, 'Asia/Tokyo');

  const invalid = await client.patch('/api/users/me', { timezone: 'Mars/Olympus' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
  assert.equal(invalid.body.error.details[0].field, 'timezone');
});

test('sessions can be listed and revoked individually or in bulk', async () => {
  const owner = newClient(baseUrl);
  const { email } = await registerUser(owner, { domain: DOMAIN, label: 'sessions' });

  // Second device: same account, another client.
  const other = newClient(baseUrl);
  const login = await loginUser(other, email);
  assert.equal(login.status, 200);

  const list = await owner.get('/api/auth/sessions');
  assert.equal(list.status, 200);
  const sessions = list.body.data.sessions;
  assert.ok(sessions.length >= 2);
  const current = sessions.filter((session) => session.current);
  assert.equal(current.length, 1);

  const target = sessions.find((session) => !session.current);
  const revoke = await owner.del(`/api/auth/sessions/${target.id}`);
  assert.equal(revoke.status, 200);

  // The revoked session is dead on its device.
  const afterRevoke = await other.get('/api/auth/session');
  assert.equal(afterRevoke.status, 401);

  // Unknown session id → 404.
  const missing = await owner.del('/api/auth/sessions/does-not-exist');
  assert.equal(missing.status, 404);

  // Bulk revocation of other sessions.
  const third = newClient(baseUrl);
  assert.equal((await loginUser(third, email)).status, 200);
  const bulk = await owner.del('/api/auth/sessions/other');
  assert.equal(bulk.status, 200);
  assert.equal(bulk.body.data.revokedCount, 1);
  assert.equal((await third.get('/api/auth/session')).status, 401);
  assert.equal((await owner.get('/api/auth/session')).status, 200);
});
