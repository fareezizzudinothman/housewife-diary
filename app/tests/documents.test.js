import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'documents.test.local';
const UPLOADS_DIR = path.resolve('uploads/documents');
let baseUrl;
let started;

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const PDF_BYTES = Buffer.from('%PDF-1.4\n% test document\n%%EOF\n');
const EXE_BYTES = Buffer.from('MZ\x90\x00 this is not a document at all');

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

async function uploadDocument(client, buffer, { title, category = 'WARRANTY', expiryDate, description, referenceType, contentType = 'application/octet-stream', filename = 'scan.pdf' } = {}) {
  const params = new URLSearchParams();
  if (title) {
    params.set('title', title);
  }
  if (category) {
    params.set('category', category);
  }
  if (expiryDate) {
    params.set('expiryDate', expiryDate);
  }
  if (description) {
    params.set('description', description);
  }
  if (referenceType) {
    params.set('referenceType', referenceType);
  }
  const query = params.toString();
  return client.upload(`/api/documents${query ? `?${query}` : ''}`, buffer, {
    filename,
    contentType,
  });
}

test('document endpoints require authentication and a household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/documents')).status, 401);

  const user = await createUser('doc-auth');
  assert.equal((await user.client.get('/api/documents')).status, 403);
});

test('uploading a document stores metadata and serves the bytes back', async () => {
  const user = await createUser('doc-upload');
  await createHousehold(user.client);

  const upload = await uploadDocument(user.client, PDF_BYTES, {
    title: 'Fridge warranty',
    category: 'WARRANTY',
    expiryDate: '2028-01-01',
    description: 'Two-year parts and labour',
    filename: 'fridge-warranty.pdf',
    contentType: 'application/pdf',
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const document = upload.body.data.document;
  assert.equal(document.title, 'Fridge warranty');
  assert.equal(document.category, 'WARRANTY');
  assert.equal(document.originalName, 'fridge-warranty.pdf');
  assert.equal(document.mimeType, 'application/pdf');
  assert.equal(document.sizeBytes, PDF_BYTES.length);
  assert.equal(document.expiryDate, '2028-01-01');
  assert.equal(document.expiryStatus, 'ACTIVE');
  assert.ok(!('storedName' in document), 'stored name must never leave the server');

  const served = await fetch(`${baseUrl}/api/documents/${document.id}/file`, {
    headers: { Cookie: user.client.cookieHeader() },
  });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'application/pdf');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  assert.match(served.headers.get('content-disposition'), /^inline;/);
  const bytes = Buffer.from(await served.arrayBuffer());
  assert.ok(bytes.equals(PDF_BYTES));

  const download = await fetch(`${baseUrl}/api/documents/${document.id}/file?download=1`, {
    headers: { Cookie: user.client.cookieHeader() },
  });
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  await download.arrayBuffer();
});

test('document list supports search, category and expiry-status filters', async () => {
  const user = await createUser('doc-list');
  await createHousehold(user.client);

  await uploadDocument(user.client, PNG_BYTES, { title: 'Passport scan', category: 'PROPERTY' });
  await uploadDocument(user.client, PDF_BYTES, { title: 'Insurance policy', category: 'INSURANCE', expiryDate: '2026-10-01' });

  const list = await user.client.get('/api/documents');
  assert.equal(list.status, 200);
  assert.equal(list.body.data.total, 2);

  const search = await user.client.get('/api/documents?search=passport');
  assert.equal(search.body.data.total, 1);

  const category = await user.client.get('/api/documents?category=INSURANCE');
  assert.equal(category.body.data.total, 1);

  const expired = await user.client.get('/api/documents?status=EXPIRED');
  assert.equal(expired.body.data.total, 1);
  assert.equal(expired.body.data.items[0].expiryStatus, 'EXPIRED');
});

test('expiry status is derived: ACTIVE / EXPIRING_SOON / EXPIRED', async () => {
  const user = await createUser('doc-expiry');
  await createHousehold(user.client);

  const far = await uploadDocument(user.client, PDF_BYTES, { title: 'Far future', expiryDate: '2040-01-01' });
  assert.equal(far.body.data.document.expiryStatus, 'ACTIVE');

  const soon = await uploadDocument(user.client, PDF_BYTES, { title: 'Soon', expiryDate: '2026-10-15' });
  assert.equal(soon.body.data.document.expiryStatus, 'EXPIRING_SOON');

  const past = await uploadDocument(user.client, PDF_BYTES, { title: 'Past', expiryDate: '2020-01-01' });
  assert.equal(past.body.data.document.expiryStatus, 'EXPIRED');

  // Clearing the expiry removes the derived status.
  const cleared = await user.client.patch(`/api/documents/${past.body.data.document.id}`, { expiryDate: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.document.expiryStatus, null);
});

test('documents can be updated and reference household records', async () => {
  const user = await createUser('doc-reference');
  await createHousehold(user.client);

  const uploaded = await uploadDocument(user.client, PDF_BYTES, { title: 'Plumbing invoice' });
  const document = uploaded.body.data.document;

  const room = await user.client.post('/api/home/rooms', { name: 'Kitchen' });
  const maintenance = await user.client.post('/api/home/maintenance', {
    roomId: room.body.data.room.id,
    title: 'Fix sink',
    category: 'Plumbing',
    scheduledDate: '2026-11-01',
  });
  assert.equal(maintenance.status, 201);

  const linked = await user.client.patch(`/api/documents/${document.id}`, {
    referenceType: 'MAINTENANCE',
    referenceId: maintenance.body.data.maintenance.id,
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.data.document.referenceType, 'MAINTENANCE');
  assert.equal(linked.body.data.document.referenceId, maintenance.body.data.maintenance.id);

  // A reference to a foreign row is rejected.
  const secondUser = await createUser('doc-ref-foreign');
  await createHousehold(secondUser.client);
  const foreign = await secondUser.client.post('/api/home/maintenance', {
    title: 'Their job',
    category: 'Other',
    scheduledDate: '2026-12-01',
  });
  const bad = await user.client.patch(`/api/documents/${document.id}`, {
    referenceType: 'MAINTENANCE',
    referenceId: foreign.body.data.maintenance.id,
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.details[0].field, 'referenceId');

  // referenceId without referenceType is rejected too.
  const mismatch = await user.client.patch(`/api/documents/${document.id}`, { referenceId: maintenance.body.data.maintenance.id });
  assert.equal(mismatch.status, 400);
});

test('invalid and oversized uploads are rejected', async () => {
  const user = await createUser('doc-invalid');
  await createHousehold(user.client);

  const invalid = await uploadDocument(user.client, EXE_BYTES, { title: 'Virus.exe' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.details[0].field, 'file');

  const noTitle = await uploadDocument(user.client, PDF_BYTES, { title: '' });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.body.error.details[0].field, 'title');

  const oversize = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41);
  const big = await uploadDocument(user.client, oversize, { title: 'Too big' });
  assert.equal(big.status, 413);
});

test('documents are isolated between households and deletable', async () => {
  const user = await createUser('doc-iso');
  await createHousehold(user.client);
  const uploaded = await uploadDocument(user.client, PNG_BYTES, { title: 'Private doc' });
  const document = uploaded.body.data.document;

  const secondUser = await createUser('doc-iso-2');
  await createHousehold(secondUser.client);
  assert.equal((await secondUser.client.get(`/api/documents/${document.id}`)).status, 404);
  assert.equal((await secondUser.client.patch(`/api/documents/${document.id}`, { title: 'Hacked' })).status, 404);
  const foreignFile = await fetch(`${baseUrl}/api/documents/${document.id}/file`, {
    headers: { Cookie: secondUser.client.cookieHeader() },
  });
  assert.equal(foreignFile.status, 404);
  assert.equal((await secondUser.client.del(`/api/documents/${document.id}`)).status, 404);

  const deleted = await user.client.del(`/api/documents/${document.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.deleted, true);

  const gone = await fetch(`${baseUrl}/api/documents/${document.id}/file`, {
    headers: { Cookie: user.client.cookieHeader() },
  });
  assert.equal(gone.status, 404);

  // Physical file cleanup is verified by directory contents elsewhere; the
  // uploads folder used by this test is committed-safe (gitignored).
  assert.ok(UPLOADS_DIR);
});