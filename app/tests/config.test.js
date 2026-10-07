import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/server/config/config.js';

const validDatabaseUrl = 'postgresql://user:pass@localhost:5432/housewife_diary';

test('loadConfig throws when DATABASE_URL is missing', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
});

test('loadConfig reads required and optional values', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    PORT: '4321',
    DATABASE_URL: validDatabaseUrl,
    SESSION_SECRET: 'test-secret',
  });
  assert.equal(config.env, 'test');
  assert.equal(config.port, 4321);
  assert.equal(config.databaseUrl, validDatabaseUrl);
  assert.equal(config.sessionSecret, 'test-secret');
});

test('loadConfig applies defaults for optional values', () => {
  const config = loadConfig({ DATABASE_URL: validDatabaseUrl });
  assert.equal(config.env, 'development');
  assert.equal(config.port, 3000);
  assert.equal(config.sessionSecret, null);
});

test('loadConfig rejects an invalid PORT', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: validDatabaseUrl, PORT: 'not-a-port' }), /PORT/);
  assert.throws(() => loadConfig({ DATABASE_URL: validDatabaseUrl, PORT: '70000' }), /PORT/);
});
