import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../app.js';
import { createPostgresStore } from '../store.js';
import { createFakePool } from './fake-pg.js';

let pool;
let server;
let baseUrl;

before(async () => {
  pool = createFakePool();
  const store = createPostgresStore(pool);
  await store.init();
  server = createServer({ store });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health returns 200 with postgres storage and runs SELECT 1 per request', async () => {
  const before = pool.queries.filter((q) => q.text === 'SELECT 1').length;
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.equal(await res.text(), '{"ok":true,"storage":"postgres"}');
  }
  assert.equal(pool.queries.filter((q) => q.text === 'SELECT 1').length, before + 2);
});

test('GET /health returns 503 without details when the database fails', async () => {
  pool.failHealth = true;
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 503);
    assert.equal(await res.text(), '{"ok":false}');
  } finally {
    pool.failHealth = false;
  }
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  await res.arrayBuffer();
});

test('createServer requires a store', () => {
  assert.throws(() => createServer(), /requires a store/);
});

test('POST /health returns 405', async () => {
  const res = await fetch(`${baseUrl}/health`, { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
  await res.arrayBuffer();
});

test('unknown path returns 404', async () => {
  const res = await fetch(`${baseUrl}/unknown`);
  assert.equal(res.status, 404);
  await res.arrayBuffer();
});
