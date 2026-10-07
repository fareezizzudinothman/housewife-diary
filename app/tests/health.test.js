import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server/app.js';

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('GET /api/health reports service and database status', async () => {
  const server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
    assert.equal(body.data.database, 'connected');
    assert.ok(body.data.timestamp);
  } finally {
    await close(server);
  }
});

test('unknown API routes return a structured 404 error', async () => {
  const server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(Array.isArray(body.error.details));
  } finally {
    await close(server);
  }
});

test('the application page is served as HTML', async () => {
  const server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, /Housewife Diary/);
  } finally {
    await close(server);
  }
});
