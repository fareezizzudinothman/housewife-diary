import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from './helpers/testServer.js';
import { resetRateLimits } from '../src/server/middleware/rateLimit.js';
import { resetAuthThrottles } from '../src/server/services/authService.js';
import { clearOutbox } from '../src/server/services/mailService.js';
import { cleanupEmailDomain, prisma } from './helpers/db.js';
import { newClient, registerUser } from './helpers/fixtures.js';

const DOMAIN = 'diary.test.local';
const UPLOADS_DIR = path.resolve('uploads/diary');

// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([0x16, 0x00, 0x00, 0x00]),
]);
const EXE_BYTES = Buffer.from('MZ\x90\x00 this is not an image at all');

let baseUrl;
let started;

before(async () => {
  started = await startTestServer();
  baseUrl = started.baseUrl;
});

after(async () => {
  // Physical files outlive their DB rows only if a test left rows behind;
  // remove anything that belonged to this test domain before cascading.
  const leftovers = await prisma.diaryAttachment.findMany({
    where: { entry: { user: { email: { endsWith: `@${DOMAIN}` } } } },
    select: { storedName: true },
  });
  await Promise.all(
    leftovers.map((row) =>
      fs.unlink(path.join(UPLOADS_DIR, row.storedName)).catch(() => {}),
    ),
  );
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

async function createHousehold(client, name = 'Diary Home') {
  const response = await client.post('/api/households', { name });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

async function createEntry(client, overrides = {}) {
  const response = await client.post('/api/diary', {
    title: 'Ordinary day',
    content: 'Some thoughts about the day.',
    entryDate: '2026-10-01',
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data.entry;
}

// ---- Create / read / update / delete ----

test('creating an entry trims input, defaults timeOfDay and dedupes tags', async () => {
  const owner = await createUser('create');
  await createHousehold(owner.client);

  const response = await owner.client.post('/api/diary', {
    title: '  Wedding anniversary  ',
    content: 'We cooked dinner together.\nIt was lovely.',
    entryDate: '2026-09-20',
    mood: 'loved',
    tags: ['Marriage', 'marriage', '  Dinner  '],
  });

  assert.equal(response.status, 201);
  const entry = response.body.data.entry;
  assert.equal(entry.title, 'Wedding anniversary');
  assert.equal(entry.entryDate, '2026-09-20');
  assert.equal(entry.timeOfDay, 'EVENING');
  assert.deepEqual(entry.mood, { id: 'loved', name: 'Loved' });
  assert.deepEqual(entry.tags.map((tag) => tag.name), ['Dinner', 'Marriage']);
  assert.equal(entry.attachmentCount, 0);
  assert.equal(entry.content, 'We cooked dinner together.\nIt was lovely.');
  assert.equal(entry.excerpt, 'We cooked dinner together. It was lovely.');
  assert.ok(entry.id.startsWith('c'));
});

test('content keeps unicode text and only strips control characters', async () => {
  const owner = await createUser('unicode');
  await createHousehold(owner.client);

  const response = await owner.client.post('/api/diary', {
    title: 'Journée à la plage',
    content: 'Soleil — 100% bonheur, ça a été “parfait” 🌊.\nControl:\u0007\u001b gone, tab\tkept.',
    entryDate: '2026-09-20',
    tags: ['été'],
  });

  assert.equal(response.status, 201);
  const entry = response.body.data.entry;
  assert.equal(entry.title, 'Journée à la plage');
  assert.equal(
    entry.content,
    'Soleil — 100% bonheur, ça a été “parfait” 🌊.\nControl: gone, tab\tkept.',
  );
  assert.equal(entry.tags[0].name, 'été');
  assert.ok(entry.excerpt.includes('Soleil — 100% bonheur'));

  const fetched = await owner.client.get(`/api/diary/${entry.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.entry.content, entry.content);
});

test('creating an entry validates title, content, date, mood and timeOfDay', async () => {
  const owner = await createUser('validate');
  await createHousehold(owner.client);

  const cases = [
    [{ title: '', content: 'ok', entryDate: '2026-10-01' }, 'title'],
    [{ title: 'x'.repeat(201), content: 'ok', entryDate: '2026-10-01' }, 'title'],
    [{ title: 'ok', content: '', entryDate: '2026-10-01' }, 'content'],
    [{ title: 'ok', content: 'x'.repeat(20001), entryDate: '2026-10-01' }, 'content'],
    [{ title: 'ok', content: 'ok', entryDate: '2026-02-30' }, 'entryDate'],
    [{ title: 'ok', content: 'ok', entryDate: 'not-a-date' }, 'entryDate'],
    [{ title: 'ok', content: 'ok', entryDate: '2026-10-01', mood: 'euphoric' }, 'mood'],
    [{ title: 'ok', content: 'ok', entryDate: '2026-10-01', timeOfDay: 'NIGHT' }, 'timeOfDay'],
    [{ title: 'ok', content: 'ok', entryDate: '2026-10-01', tags: 'family' }, 'tags'],
    [{ title: 'ok', content: 'ok', entryDate: '2026-10-01', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] }, 'tags'],
  ];

  for (const [payload, field] of cases) {
    const response = await owner.client.post('/api/diary', payload);
    assert.equal(response.status, 400, `expected 400 for ${field}: ${JSON.stringify(payload).slice(0, 80)}`);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(
      response.body.error.details.some((detail) => detail.field === field),
      `missing field detail ${field}: ${JSON.stringify(response.body.error.details)}`,
    );
  }
});

test('fetching, updating and deleting a single entry', async () => {
  const owner = await createUser('crud');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client, { mood: 'calm', tags: ['Home'] });

  const fetched = await owner.client.get(`/api/diary/${entry.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.entry.content, 'Some thoughts about the day.');
  assert.equal(fetched.body.data.entry.attachments.length, 0);

  const patched = await owner.client.patch(`/api/diary/${entry.id}`, {
    title: 'Rewritten day',
    mood: null,
    tags: ['Rewrite'],
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.entry.title, 'Rewritten day');
  assert.equal(patched.body.data.entry.mood, null);
  assert.deepEqual(patched.body.data.entry.tags.map((tag) => tag.name), ['Rewrite']);
  // Untouched fields survive the patch.
  assert.equal(patched.body.data.entry.content, 'Some thoughts about the day.');
  assert.equal(patched.body.data.entry.entryDate, '2026-10-01');

  const emptyPatch = await owner.client.patch(`/api/diary/${entry.id}`, {});
  assert.equal(emptyPatch.status, 400);

  const deleted = await owner.client.del(`/api/diary/${entry.id}`);
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: entry.id, deleted: true });

  const gone = await owner.client.get(`/api/diary/${entry.id}`);
  assert.equal(gone.status, 404);
});

test('updating an entry re-validates provided fields', async () => {
  const owner = await createUser('patch-validate');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);

  const badDate = await owner.client.patch(`/api/diary/${entry.id}`, { entryDate: '2026-13-40' });
  assert.equal(badDate.status, 400);

  const badMood = await owner.client.patch(`/api/diary/${entry.id}`, { mood: 'nostalgic' });
  assert.equal(badMood.status, 400);
});

// ---- Listing, search, filters, pagination ----

test('listing returns newest entries first with pagination metadata', async () => {
  const owner = await createUser('list');
  await createHousehold(owner.client);
  await createEntry(owner.client, { title: 'Older', entryDate: '2026-09-01' });
  await createEntry(owner.client, { title: 'Newest', entryDate: '2026-10-05' });
  await createEntry(owner.client, { title: 'Middle', entryDate: '2026-09-20' });

  const page1 = await owner.client.get('/api/diary?page=1&limit=2');
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.total, 3);
  assert.equal(page1.body.data.totalPages, 2);
  assert.equal(page1.body.data.page, 1);
  assert.deepEqual(
    page1.body.data.items.map((item) => item.title),
    ['Newest', 'Middle'],
  );

  const page2 = await owner.client.get('/api/diary?page=2&limit=2');
  assert.deepEqual(page2.body.data.items.map((item) => item.title), ['Older']);

  const ids = [...page1.body.data.items, ...page2.body.data.items].map((item) => item.id);
  assert.equal(new Set(ids).size, 3);
});

test('search matches title and content, including LIKE wildcards', async () => {
  const owner = await createUser('search');
  await createHousehold(owner.client);
  await createEntry(owner.client, {
    title: 'Garden plans',
    content: 'Plant tomatoes and 100% organic herbs.',
    entryDate: '2026-10-02',
  });
  await createEntry(owner.client, {
    title: 'School run',
    content: 'Packed lunches for the kids.',
    entryDate: '2026-10-03',
  });

  const byTitle = await owner.client.get(`/api/diary?search=${encodeURIComponent('garden')}`);
  assert.equal(byTitle.body.data.total, 1);
  assert.equal(byTitle.body.data.items[0].title, 'Garden plans');

  const byWildcard = await owner.client.get(`/api/diary?search=${encodeURIComponent('100%')}`);
  assert.equal(byWildcard.body.data.total, 1);

  const literalPercent = await owner.client.get(`/api/diary?search=${encodeURIComponent('100%x')}`);
  assert.equal(literalPercent.body.data.total, 0);

  const noMatch = await owner.client.get(`/api/diary?search=${encodeURIComponent('zzz-nothing')}`);
  assert.equal(noMatch.body.data.total, 0);
});

test('date range, mood and tag filters combine', async () => {
  const owner = await createUser('filters');
  await createHousehold(owner.client);
  await createEntry(owner.client, {
    title: 'Happy hike',
    entryDate: '2026-09-10',
    mood: 'excited',
    tags: ['Outdoors'],
  });
  await createEntry(owner.client, {
    title: 'Tired evening',
    entryDate: '2026-10-04',
    mood: 'tired',
    tags: ['Home'],
  });
  await createEntry(owner.client, { title: 'Plain day', entryDate: '2026-09-30' });

  const range = await owner.client.get('/api/diary?from=2026-09-01&to=2026-09-30');
  assert.equal(range.body.data.total, 2);

  const mood = await owner.client.get('/api/diary?mood=excited');
  assert.equal(mood.body.data.total, 1);
  assert.equal(mood.body.data.items[0].title, 'Happy hike');

  const tag = await owner.client.get('/api/diary?tag=outdoors');
  assert.equal(tag.body.data.total, 1);

  const combined = await owner.client.get('/api/diary?from=2026-09-01&to=2026-09-30&mood=excited');
  assert.equal(combined.body.data.total, 1);

  const unknownMood = await owner.client.get('/api/diary?mood=blissful');
  assert.equal(unknownMood.status, 400);

  const invertedRange = await owner.client.get('/api/diary?from=2026-10-10&to=2026-10-01');
  assert.equal(invertedRange.status, 400);

  const badPage = await owner.client.get('/api/diary?page=0');
  assert.equal(badPage.status, 400);

  const badLimit = await owner.client.get('/api/diary?limit=51');
  assert.equal(badLimit.status, 400);
});

test('meta exposes the mood catalog and only my own tags', async () => {
  const alice = await createUser('meta-a');
  await createHousehold(alice.client);
  await createEntry(alice.client, { tags: ['AliceOnly'] });

  const bob = await createUser('meta-b');
  await createHousehold(bob.client, 'Bob Home');
  await createEntry(bob.client, { tags: ['BobOnly'] });

  const meta = await alice.client.get('/api/diary/meta');
  assert.equal(meta.status, 200);
  assert.deepEqual(
    meta.body.data.moods.map((mood) => mood.id),
    ['happy', 'calm', 'loved', 'excited', 'neutral', 'tired', 'sad', 'stressed', 'angry', 'anxious'],
  );
  assert.deepEqual(meta.body.data.tags.map((tag) => tag.name), ['AliceOnly']);

  const bobMeta = await bob.client.get('/api/diary/meta');
  assert.deepEqual(bobMeta.body.data.tags.map((tag) => tag.name), ['BobOnly']);
});

// ---- Isolation and authorization ----

test('diary requires authentication', async () => {
  const anonymous = newClient(baseUrl);
  const list = await anonymous.get('/api/diary');
  assert.equal(list.status, 401);

  const create = await anonymous.post('/api/diary', {
    title: 'x',
    content: 'y',
    entryDate: '2026-10-01',
  });
  assert.equal(create.status, 401);

  const meta = await anonymous.get('/api/diary/meta');
  assert.equal(meta.status, 401);
});

test('diary without an active household is forbidden', async () => {
  const user = await createUser('no-household');
  const response = await user.client.get('/api/diary');
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test("another user cannot read, modify or delete my entry", async () => {
  const alice = await createUser('iso-a');
  const aliceHousehold = await createHousehold(alice.client, 'Alice Home');
  const entry = await createEntry(alice.client, { title: 'Private diary' });

  // Bob has his own household in a different household boundary.
  const bob = await createUser('iso-b');
  await createHousehold(bob.client, 'Bob Home');

  assert.equal((await bob.client.get(`/api/diary/${entry.id}`)).status, 404);
  assert.equal((await bob.client.patch(`/api/diary/${entry.id}`, { title: 'hacked' })).status, 404);
  assert.equal((await bob.client.del(`/api/diary/${entry.id}`)).status, 404);
  assert.equal((await bob.client.get('/api/diary')).body.data.total, 0);

  // A second member of ALICE's household still cannot see her personal entry.
  const carol = await createUser('iso-carol');
  const added = await alice.client.post(`/api/households/${aliceHousehold.household.id}/members`, {
    email: carol.email,
    role: 'MEMBER',
  });
  assert.equal(added.status, 201);
  await carol.client.post(`/api/households/${aliceHousehold.household.id}/switch`);
  assert.equal((await carol.client.get(`/api/diary/${entry.id}`)).status, 404);
  assert.equal((await carol.client.get('/api/diary')).body.data.total, 0);

  // Alice still sees it.
  assert.equal((await alice.client.get(`/api/diary/${entry.id}`)).status, 200);
});

test('entries stay bound to the household they were written in', async () => {
  const owner = await createUser('boundaries');
  const first = await createHousehold(owner.client, 'Home One');
  const entry = await createEntry(owner.client, { title: 'Home one thoughts' });

  const second = await owner.client.post('/api/households', { name: 'Home Two' });
  assert.equal(second.status, 201);
  const switched = await owner.client.post(
    `/api/households/${second.body.data.household.id}/switch`,
  );
  assert.equal(switched.status, 200);

  const list = await owner.client.get('/api/diary');
  assert.equal(list.body.data.total, 0);
  assert.equal((await owner.client.get(`/api/diary/${entry.id}`)).status, 404);

  await owner.client.post(`/api/households/${first.household.id}/switch`);
  assert.equal((await owner.client.get(`/api/diary/${entry.id}`)).status, 200);
});

// ---- Attachments ----

test('uploading a valid image stores metadata and serves the bytes back', async () => {
  const owner = await createUser('upload');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);

  const upload = await owner.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
    filename: '../../sneaky path/photo.png',
    contentType: 'image/png',
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  const attachment = upload.body.data.attachment;
  assert.equal(attachment.mimeType, 'image/png');
  assert.equal(attachment.sizeBytes, PNG_BYTES.length);
  assert.equal(attachment.originalName, 'photo.png');
  // The stored name never leaves the server.
  assert.equal(attachment.storedName, undefined);
  assert.ok(!('storedName' in attachment));

  const detail = await owner.client.get(`/api/diary/${entry.id}`);
  assert.equal(detail.body.data.entry.attachmentCount, 1);
  assert.equal(detail.body.data.entry.attachments.length, 1);

  const served = await fetch(`${baseUrl}/api/diary/${entry.id}/attachments/${attachment.id}`, {
    headers: { Cookie: owner.client.cookieHeader() },
  });
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.match(served.headers.get('content-disposition'), /^inline;/);
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await served.arrayBuffer());
  assert.ok(bytes.equals(PNG_BYTES));

  const download = await fetch(
    `${baseUrl}/api/diary/${entry.id}/attachments/${attachment.id}?download=1`,
    { headers: { Cookie: owner.client.cookieHeader() } },
  );
  assert.match(download.headers.get('content-disposition'), /^attachment;/);
  await download.arrayBuffer();
});

test('JPEG, GIF and WebP uploads are accepted based on magic bytes', async () => {
  const owner = await createUser('formats');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);

  const cases = [
    [JPEG_BYTES, 'image/jpeg'],
    [GIF_BYTES, 'image/gif'],
    [WEBP_BYTES, 'image/webp'],
  ];
  for (const [bytes, mime] of cases) {
    const upload = await owner.client.upload(`/api/diary/${entry.id}/attachments`, bytes, {
      filename: 'picture',
      contentType: mime,
    });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    assert.equal(upload.body.data.attachment.mimeType, mime);
  }
});

test('executables, wrong content types and empty bodies are rejected', async () => {
  const owner = await createUser('reject');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);

  const executable = await owner.client.upload(
    `/api/diary/${entry.id}/attachments`,
    EXE_BYTES,
    { filename: 'setup.exe', contentType: 'application/octet-stream' },
  );
  assert.equal(executable.status, 400);
  assert.match(executable.body.error.details[0].message, /JPEG, PNG, GIF and WebP/);

  const mislabeled = await owner.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
    filename: 'tricked.png',
    contentType: 'application/pdf',
  });
  assert.equal(mislabeled.status, 400);

  const empty = await owner.client.upload(`/api/diary/${entry.id}/attachments`, Buffer.alloc(0), {
    filename: 'empty.png',
    contentType: 'image/png',
  });
  assert.equal(empty.status, 400);
});

test('attachments larger than 5MB are rejected with 413', async () => {
  const owner = await createUser('oversize');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);

  const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41);
  const response = await owner.client.upload(`/api/diary/${entry.id}/attachments`, huge, {
    filename: 'huge.png',
    contentType: 'image/png',
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('an entry accepts at most five attachments', async () => {
  const owner = await createUser('max-attach');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);

  for (let index = 0; index < 5; index += 1) {
    const upload = await owner.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
      filename: `photo-${index}.png`,
      contentType: 'image/png',
    });
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
  }
  const overflow = await owner.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
    filename: 'one-too-many.png',
    contentType: 'image/png',
  });
  assert.equal(overflow.status, 400);
  assert.match(overflow.body.error.details[0].message, /at most 5 attachments/);
});

test('attachments are isolated per user and entry', async () => {
  const alice = await createUser('att-a');
  await createHousehold(alice.client, 'Alice Home');
  const entry = await createEntry(alice.client);
  const upload = await alice.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
    filename: 'mine.png',
    contentType: 'image/png',
  });
  const attachmentId = upload.body.data.attachment.id;

  const bob = await createUser('att-b');
  await createHousehold(bob.client, 'Bob Home');

  assert.equal(
    (await bob.client.get(`/api/diary/${entry.id}/attachments/${attachmentId}`)).status,
    404,
  );
  assert.equal(
    (await bob.client.del(`/api/diary/${entry.id}/attachments/${attachmentId}`)).status,
    404,
  );
  assert.equal(
    (await bob.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
      filename: 'x.png',
      contentType: 'image/png',
    })).status,
    404,
  );
  assert.equal((await bob.client.get(`/api/diary/${entry.id}`)).status, 404);
});

test('deleting an attachment removes metadata and the physical file', async () => {
  const owner = await createUser('att-delete');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);
  const upload = await owner.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
    filename: 'temporary.png',
    contentType: 'image/png',
  });
  const attachment = upload.body.data.attachment;

  const detail = await owner.client.get(`/api/diary/${entry.id}`);
  const stored = await prisma.diaryAttachment.findUnique({
    where: { id: attachment.id },
    select: { storedName: true },
  });
  assert.ok(stored, 'attachment row should exist');

  const deleted = await owner.client.del(
    `/api/diary/${entry.id}/attachments/${attachment.id}`,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.body.data, { id: attachment.id, deleted: true });

  assert.equal(await prisma.diaryAttachment.findUnique({ where: { id: attachment.id } }), null);
  await assert.rejects(fs.access(path.join(UPLOADS_DIR, stored.storedName)));

  const servedAgain = await owner.client.get(
    `/api/diary/${entry.id}/attachments/${attachment.id}`,
  );
  assert.equal(servedAgain.status, 404);
});

test('deleting an entry removes its attachment rows and files', async () => {
  const owner = await createUser('entry-files');
  await createHousehold(owner.client);
  const entry = await createEntry(owner.client);
  const upload = await owner.client.upload(`/api/diary/${entry.id}/attachments`, PNG_BYTES, {
    filename: 'keep-or-not.png',
    contentType: 'image/png',
  });
  const stored = await prisma.diaryAttachment.findUnique({
    where: { id: upload.body.data.attachment.id },
    select: { storedName: true },
  });

  const deleted = await owner.client.del(`/api/diary/${entry.id}`);
  assert.equal(deleted.status, 200);
  await assert.rejects(fs.access(path.join(UPLOADS_DIR, stored.storedName)));
});
