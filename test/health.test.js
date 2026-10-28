import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../app.js';
import { createMemoryStore } from '../store.js';

let server;
let baseUrl;

before(async () => {
  server = createServer({ store: createMemoryStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health returns 200 with memory storage', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(await res.text(), '{"ok":true,"storage":"memory"}');
});

test('GET /health returns 503 without details when store is unhealthy', async () => {
  const failing = { ...createMemoryStore(), kind: 'postgres', health: async () => false };
  const s = createServer({ store: failing });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/health`);
    assert.equal(res.status, 503);
    assert.equal(await res.text(), '{"ok":false}');
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
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
