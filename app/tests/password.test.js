import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox, getOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain, findUserByEmail, prisma } from './helpers/db.js';
import { hashToken } from '../src/server/utils/tokens.js';
import { hashPassword, verifyPassword } from '../src/server/utils/passwords.js';
import { checkPasswordPolicy } from '../src/server/validators/shared.js';
import { newClient, registerUser, loginUser, uniqueEmail, TEST_PASSWORD } from './helpers/fixtures.js';

const DOMAIN = 'password.test.local';
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

function lastMailTo(email) {
  const mails = getOutbox().filter((mail) => mail.to === email);
  return mails.at(-1);
}

function extractToken(mail) {
  const match = mail.text.match(/token=([A-Za-z0-9_-]+)/);
  assert.ok(match, `no token found in mail: ${mail.subject}`);
  return match[1];
}

// ---- Password hashing (unit) ----

test('passwords are hashed with bcrypt cost 12 and never stored in plaintext', async () => {
  const password = 'a very long passphrase for hashing';
  const hash = await hashPassword(password, 12);
  assert.notEqual(hash, password);
  assert.match(hash, /^\$2b\$12\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(`${password}!`, hash), false);

  const second = await hashPassword(password, 12);
  assert.notEqual(second, hash, 'unique salt per hash');
});

test('password policy enforces length and the common-password denylist', () => {
  assert.match(checkPasswordPolicy('short'), /at least 10/);
  assert.match(checkPasswordPolicy('password123'), /too common/i);
  assert.match(checkPasswordPolicy(12345678901), /at least 10/);
  assert.equal(checkPasswordPolicy('a passphrase nobody would guess 99'), null);
});

// ---- Forgot / reset ----

test('forgot password returns a uniform response and emails a single-use token', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'forgot' });

  // Registration already sent a verification mail; count from here.
  const mailsBefore = getOutbox().length;
  const known = await client.post('/api/auth/forgot-password', { email });
  assert.equal(known.status, 200);
  assert.equal(getOutbox().length, mailsBefore + 1);
  const resetMails = getOutbox().filter((mail) => mail.subject.includes('Reset your'));
  assert.equal(resetMails.length, 1);
  assert.equal(resetMails[0].to, email);
  const token = extractToken(resetMails[0]);
  assert.ok(token.length >= 40);

  const unknown = await client.post('/api/auth/forgot-password', {
    email: uniqueEmail(DOMAIN, 'ghost'),
  });
  assert.equal(unknown.status, 200);
  // Identical message for existing and unknown accounts.
  assert.deepEqual(unknown.body, known.body);
  assert.equal(
    getOutbox().filter((mail) => mail.subject.includes('Reset your')).length,
    1,
    'no mail for unknown accounts',
  );
});

test('reset password consumes the token, rotates the password and revokes sessions', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'reset-ok' });
  const oldSessionToken = client.cookies.get('hd_session');

  await client.post('/api/auth/forgot-password', { email });
  const token = extractToken(lastMailTo(email));

  const reset = await client.post('/api/auth/reset-password', {
    token,
    password: 'a completely new passphrase',
  });
  assert.equal(reset.status, 200);

  // Old password is dead; new one works.
  const oldPassword = await loginUser(newClient(baseUrl), email, TEST_PASSWORD);
  assert.equal(oldPassword.status, 401);
  const newPassword = await loginUser(newClient(baseUrl), email, 'a completely new passphrase');
  assert.equal(newPassword.status, 200);

  // All pre-reset sessions were revoked.
  const oldClient = newClient(baseUrl);
  oldClient.setCookie('hd_session', oldSessionToken);
  assert.equal((await oldClient.get('/api/auth/session')).status, 401);

  // The token cannot be reused.
  const reuse = await client.post('/api/auth/reset-password', {
    token,
    password: 'yet another passphrase',
  });
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.error.code, 'UNAUTHORIZED');
});

test('reset password rejects invalid, expired and malformed tokens', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'reset-bad' });

  const invalid = await client.post('/api/auth/reset-password', {
    token: 'made-up-token-value',
    password: 'a perfectly fine passphrase',
  });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'UNAUTHORIZED');

  // Seed an already-expired token directly.
  const user = await findUserByEmail(email);
  const rawExpired = 'seeded-expired-reset-token';
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawExpired),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  const expired = await client.post('/api/auth/reset-password', {
    token: rawExpired,
    password: 'a perfectly fine passphrase',
  });
  assert.equal(expired.status, 401);

  const shortPassword = await client.post('/api/auth/reset-password', {
    token: 'whatever',
    password: 'short123',
  });
  assert.equal(shortPassword.status, 400);
  assert.equal(shortPassword.body.error.code, 'VALIDATION_ERROR');
});

// ---- Change password ----

test('change password requires the current password and revokes other sessions only', async () => {
  const owner = newClient(baseUrl);
  const { email } = await registerUser(owner, { domain: DOMAIN, label: 'change-ok' });

  const other = newClient(baseUrl);
  assert.equal((await loginUser(other, email)).status, 200);

  const wrong = await owner.post('/api/auth/change-password', {
    currentPassword: 'not-the-password',
    newPassword: 'a totally new passphrase',
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, 'UNAUTHORIZED');

  const ok = await owner.post('/api/auth/change-password', {
    currentPassword: TEST_PASSWORD,
    newPassword: 'a totally new passphrase',
  });
  assert.equal(ok.status, 200);

  // Other session was revoked; the current one still works.
  assert.equal((await other.get('/api/auth/session')).status, 401);
  assert.equal((await owner.get('/api/auth/session')).status, 200);

  // Login with the new password works, old one does not.
  assert.equal((await loginUser(newClient(baseUrl), email, 'a totally new passphrase')).status, 200);
  assert.equal((await loginUser(newClient(baseUrl), email, TEST_PASSWORD)).status, 401);
});

test('change password validates the new password against the policy', async () => {
  const client = newClient(baseUrl);
  await registerUser(client, { domain: DOMAIN, label: 'change-policy' });

  const short = await client.post('/api/auth/change-password', {
    currentPassword: TEST_PASSWORD,
    newPassword: 'short123',
  });
  assert.equal(short.status, 400);
  assert.equal(short.body.error.details[0].field, 'newPassword');
});

// ---- Email verification ----

test('email verification: valid token verifies, invalid and expired tokens fail', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'verify' });
  assert.equal(lastMailTo(email).subject, 'Verify your Housewife Diary email');
  const token = extractToken(lastMailTo(email));

  const invalid = await client.get('/api/auth/verify-email?token=bogus-token-value');
  assert.equal(invalid.status, 401);

  const user = await findUserByEmail(email);
  const rawExpired = 'seeded-expired-verification-token';
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawExpired),
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  const expired = await client.get(`/api/auth/verify-email?token=${rawExpired}`);
  assert.equal(expired.status, 401);

  const valid = await client.get(`/api/auth/verify-email?token=${token}`);
  assert.equal(valid.status, 200);

  const session = await client.get('/api/auth/session');
  assert.ok(session.body.data.user.emailVerifiedAt, 'email should now be verified');

  // The token is single-use.
  const replay = await client.get(`/api/auth/verify-email?token=${token}`);
  assert.equal(replay.status, 401);
});

test('verification resend requires auth, throttles and conflicts once verified', async () => {
  const client = newClient(baseUrl);
  const { email } = await registerUser(client, { domain: DOMAIN, label: 'resend' });

  const anonymous = newClient(baseUrl);
  const unauthenticated = await anonymous.post('/api/auth/verify-email/resend');
  assert.equal(unauthenticated.status, 401);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const resend = await client.post('/api/auth/verify-email/resend');
    assert.equal(resend.status, 200, `resend ${attempt} should succeed`);
    assert.ok(lastMailTo(email), 'mail present after resend');
  }
  const throttled = await client.post('/api/auth/verify-email/resend');
  assert.equal(throttled.status, 429);
  assert.equal(throttled.body.error.code, 'RATE_LIMITED');

  // Verify, then resend conflicts.
  const token = extractToken(lastMailTo(email));
  assert.equal((await client.get(`/api/auth/verify-email?token=${token}`)).status, 200);
  const alreadyVerified = await client.post('/api/auth/verify-email/resend');
  assert.equal(alreadyVerified.status, 409);
  assert.equal(alreadyVerified.body.error.code, 'CONFLICT');
});
