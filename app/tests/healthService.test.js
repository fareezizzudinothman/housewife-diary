import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHealth } from '../src/server/services/healthService.js';

test('checkHealth reports connected when the database responds', async () => {
  const fakeClient = {
    async $queryRaw() {
      return [1];
    },
  };
  const health = await checkHealth(fakeClient);
  assert.equal(health.status, 'ok');
  assert.equal(health.database, 'connected');
  assert.ok(health.timestamp);
});

test('checkHealth maps any database ping failure to DATABASE_ERROR 503', async () => {
  const fakeClient = {
    async $queryRaw() {
      throw new Error('Server has closed the connection.');
    },
  };
  await assert.rejects(checkHealth(fakeClient), (error) => {
    assert.equal(error.code, 'DATABASE_ERROR');
    assert.equal(error.status, 503);
    assert.equal(error.message, 'The database is currently unreachable.');
    assert.equal(error.cause.message, 'Server has closed the connection.');
    return true;
  });
});
