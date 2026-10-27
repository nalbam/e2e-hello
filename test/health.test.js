import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../app.js';

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health returns 200 with {"ok":true}', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(await res.text(), '{"ok":true}');
});

test('POST /health returns 405', async () => {
  const res = await fetch(`${baseUrl}/health`, { method: 'POST' });
  assert.equal(res.status, 405);
  await res.arrayBuffer();
});

test('unknown path returns 404', async () => {
  const res = await fetch(`${baseUrl}/unknown`);
  assert.equal(res.status, 404);
  await res.arrayBuffer();
});
