import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'finance-receipts.test.local';

// 1x1 transparent PNG and a minimal JPEG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([0x16, 0x00, 0x00, 0x00]),
]);
const EXE_BYTES = Buffer.from('MZ\x90\x00 this is not a receipt');

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
  const { user } = await registerUser(client, { domain: DOMAIN, label });
  return { client, user };
}

async function setup(label) {
  const owner = await createUser(label);
  const response = await owner.client.post('/api/households', { name: 'Receipt Home' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return owner;
}

async function createTransaction(client, overrides = {}) {
  const response = await client.post('/api/finance/transactions', {
    type: 'EXPENSE',
    amount: '42.50',
    currency: 'SGD',
    categoryId: 'fcat-exp-food',
    transactionDate: '2026-10-08',
    description: 'Lunch',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.transaction;
}

async function fetchRaw(client, path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Cookie: client.cookieHeader(), Accept: '*/*' },
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, buffer };
}

test('receipts require authentication and an active household', async () => {
  const anonymous = newClient(baseUrl);
  assert.equal((await anonymous.get('/api/finance/transactions/x/receipt')).status, 401);

  const user = await createUser('no-household');
  assert.equal((await user.client.get('/api/finance/transactions/x/receipt')).status, 403);
});

test('receipts are private to the owning household transaction', async () => {
  const owner = await setup('isolation-a');
  const transaction = await createTransaction(owner.client);
  const uploaded = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    JPEG_BYTES,
    { filename: 'receipt.jpg', contentType: 'image/jpeg' },
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));

  const stranger = await setup('isolation-b');
  assert.equal(
    (await stranger.client.get(`/api/finance/transactions/${transaction.id}/receipt`)).status,
    404,
  );
  assert.equal(
    (await stranger.client.del(`/api/finance/transactions/${transaction.id}/receipt`)).status,
    404,
  );
  const crossUpload = await stranger.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    JPEG_BYTES,
    { filename: 'x.jpg', contentType: 'image/jpeg' },
  );
  assert.equal(crossUpload.status, 404);
});

test('a receipt uploads, is retrievable as bytes and deletes cleanly', async () => {
  const owner = await setup('lifecycle');
  const transaction = await createTransaction(owner.client);

  const upload = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    PNG_BYTES,
    { filename: '  lunch receipt.png ', contentType: 'image/png' },
  );
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const receipt = upload.body.data.receipt;
  assert.ok(receipt.id.startsWith('c'));
  assert.equal(receipt.originalName, 'lunch receipt.png');
  assert.equal(receipt.mimeType, 'image/png');
  assert.equal(receipt.sizeBytes, PNG_BYTES.length);
  assert.equal(receipt.url, `/api/finance/transactions/${transaction.id}/receipt`);
  assert.equal(receipt.transactionId, transaction.id);

  const detail = await owner.client.get(`/api/finance/transactions/${transaction.id}`);
  assert.equal(detail.body.data.transaction.hasReceipt, true);
  assert.equal(detail.body.data.transaction.receipt.originalName, 'lunch receipt.png');

  const inline = await fetchRaw(owner.client, `/api/finance/transactions/${transaction.id}/receipt`);
  assert.equal(inline.status, 200);
  assert.equal(inline.headers.get('content-type'), 'image/png');
  assert.equal(inline.headers.get('x-content-type-options'), 'nosniff');
  assert.match(inline.headers.get('content-disposition'), /^inline/);
  assert.deepEqual(inline.buffer, PNG_BYTES);

  const download = await fetchRaw(
    owner.client,
    `/api/finance/transactions/${transaction.id}/receipt?download=1`,
  );
  assert.match(download.headers.get('content-disposition'), /^attachment/);

  const deleted = await owner.client.del(
    `/api/finance/transactions/${transaction.id}/receipt`,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: receipt.id, deleted: true });
  assert.equal(
    (await fetchRaw(owner.client, `/api/finance/transactions/${transaction.id}/receipt`)).status,
    404,
  );
  const after = await owner.client.get(`/api/finance/transactions/${transaction.id}`);
  assert.equal(after.body.data.transaction.hasReceipt, false);

  // A fresh upload after deletion is allowed.
  const again = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    PDF_BYTES,
    { filename: 'receipt.pdf', contentType: 'application/pdf' },
  );
  assert.equal(again.status, 201);
  assert.equal(again.body.data.receipt.mimeType, 'application/pdf');
});

test('receipt uploads validate type, size and one-per-transaction', async () => {
  const owner = await setup('validate');
  const transaction = await createTransaction(owner.client);

  for (const [bytes, filename, contentType] of [
    [GIF_BYTES, 'receipt.gif', 'image/gif'],
    [EXE_BYTES, 'receipt.exe', 'application/octet-stream'],
    [Buffer.from('plain text'), 'receipt.txt', 'text/plain'],
  ]) {
    const response = await owner.client.upload(
      `/api/finance/transactions/${transaction.id}/receipt`,
      bytes,
      { filename, contentType },
    );
    assert.equal(response.status, 400, `expected 400 for ${filename}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }

  const empty = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    Buffer.alloc(0),
    { filename: 'empty.png', contentType: 'image/png' },
  );
  assert.equal(empty.status, 400);

  const oversized = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    Buffer.alloc(5 * 1024 * 1024 + 1, 0x41),
    { filename: 'huge.pdf', contentType: 'application/pdf' },
  );
  assert.equal(oversized.status, 413);

  const valid = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    WEBP_BYTES,
    { filename: 'receipt.webp', contentType: 'image/webp' },
  );
  assert.equal(valid.status, 201, JSON.stringify(valid.body));

  const duplicate = await owner.client.upload(
    `/api/finance/transactions/${transaction.id}/receipt`,
    PNG_BYTES,
    { filename: 'second.png', contentType: 'image/png' },
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'CONFLICT');
});

test('receipt deletion of a missing receipt is a 404', async () => {
  const owner = await setup('missing');
  const transaction = await createTransaction(owner.client);
  const response = await owner.client.del(`/api/finance/transactions/${transaction.id}/receipt`);
  assert.equal(response.status, 404);
});
