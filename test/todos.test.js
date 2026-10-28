import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../app.js';
import { createMemoryStore } from '../store.js';

let server;
let baseUrl;

before(async () => {
  server = createServer({ store: createMemoryStore() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function send(path, method, body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function assertJson(res) {
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
}

test('todo CRUD flow', async () => {
  let res = await fetch(`${baseUrl}/api/todos`);
  assert.equal(res.status, 200);
  assertJson(res);
  assert.deepEqual(await res.json(), []);

  res = await send('/api/todos', 'POST', { title: '  first  ' });
  assert.equal(res.status, 201);
  assertJson(res);
  const first = await res.json();
  assert.equal(first.title, 'first');
  assert.equal(first.done, false);
  assert.equal(typeof first.id, 'number');
  assert.ok(!Number.isNaN(Date.parse(first.createdAt)));

  res = await send('/api/todos', 'POST', { title: 'second' });
  const second = await res.json();

  res = await fetch(`${baseUrl}/api/todos`);
  assert.deepEqual(
    (await res.json()).map((t) => t.id),
    [first.id, second.id],
  );

  res = await send(`/api/todos/${first.id}`, 'PATCH', { done: true });
  assert.equal(res.status, 200);
  assertJson(res);
  assert.deepEqual(await res.json(), { ...first, done: true });

  res = await send(`/api/todos/${first.id}`, 'PATCH', { title: 'renamed', done: false });
  assert.deepEqual(await res.json(), { ...first, title: 'renamed', done: false });

  res = await fetch(`${baseUrl}/api/todos/${first.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');

  res = await fetch(`${baseUrl}/api/todos/${first.id}`, { method: 'DELETE' });
  assert.equal(res.status, 404);
  await res.arrayBuffer();

  res = await fetch(`${baseUrl}/api/todos`);
  assert.deepEqual(await res.json(), [second]);
});

test('POST validation returns 400', async () => {
  const invalid = [
    {},
    { title: 123 },
    { title: '' },
    { title: '   ' },
    { title: 'x'.repeat(201) },
    [],
    null,
  ];
  for (const body of invalid) {
    const res = await send('/api/todos', 'POST', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assertJson(res);
    assert.equal(typeof (await res.json()).error, 'string');
  }

  const ok = await send('/api/todos', 'POST', { title: 'y'.repeat(200) });
  assert.equal(ok.status, 201);
  await ok.arrayBuffer();
});

test('invalid JSON returns 400', async () => {
  const res = await send('/api/todos', 'POST', '{"title":');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid JSON' });
});

test('oversized body returns 413', async () => {
  const res = await send('/api/todos', 'POST', { title: 'z'.repeat(17 * 1024) });
  assert.equal(res.status, 413);
  assertJson(res);
  assert.equal(typeof (await res.json()).error, 'string');
});

test('PATCH validation returns 400 and missing id returns 404', async () => {
  const created = await (await send('/api/todos', 'POST', { title: 'patch me' })).json();

  for (const body of [{}, { done: 'yes' }, { title: '' }, { title: 5 }, [], 'null']) {
    const res = await send(`/api/todos/${created.id}`, 'PATCH', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    await res.arrayBuffer();
  }

  const res = await send('/api/todos/999999', 'PATCH', { done: true });
  assert.equal(res.status, 404);
  assertJson(res);
  await res.arrayBuffer();
});

test('non-integer ids return 404', async () => {
  for (const id of ['abc', '1.5', '-1', '0', '01', '1e3', '99999999999999999999']) {
    const res = await send(`/api/todos/${id}`, 'PATCH', { done: true });
    assert.equal(res.status, 404, id);
    await res.arrayBuffer();
  }
  const res = await fetch(`${baseUrl}/api/todos/abc`, { method: 'DELETE' });
  assert.equal(res.status, 404);
  await res.arrayBuffer();
});

test('disallowed methods return 405 with allow header', async () => {
  let res = await fetch(`${baseUrl}/api/todos`, { method: 'PUT' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, POST');
  await res.arrayBuffer();

  res = await fetch(`${baseUrl}/api/todos/1`, { method: 'GET' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'PATCH, DELETE');
  await res.arrayBuffer();

  res = await fetch(`${baseUrl}/todos`, { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD');
  await res.arrayBuffer();
});

test('GET /todos returns self-contained HTML page', async () => {
  const res = await fetch(`${baseUrl}/todos`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  const html = await res.text();
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<label for="title">/);
  assert.match(html, /color-scheme: light dark/);
  assert.match(html, /light-dark\(/);
  assert.match(html, /textContent/);
  assert.doesNotMatch(html, /innerHTML/);
  assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=/i);
  assert.doesNotMatch(html, /https?:\/\//);

  const head = await fetch(`${baseUrl}/todos`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('unknown api path returns 404', async () => {
  const res = await fetch(`${baseUrl}/api/todos/1/extra`);
  assert.equal(res.status, 404);
  await res.arrayBuffer();
});
