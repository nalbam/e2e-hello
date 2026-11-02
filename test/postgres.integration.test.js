import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createPostgresStore } from '../store.js';

// Runs only against a disposable database given by DATABASE_URL; rows it creates are deleted afterwards.
const url = process.env.DATABASE_URL;
const skip = url ? false : 'DATABASE_URL not set';

let store;
const created = [];

before(async () => {
  if (skip) return;
  store = createPostgresStore(new pg.Pool({ connectionString: url, connectionTimeoutMillis: 5000 }));
  await store.init();
  await store.init();
});

after(async () => {
  if (!store) return;
  for (const id of created) await store.remove(id);
  await store.close();
});

test('real PostgreSQL CRUD and concurrent updates', { skip }, async () => {
  assert.equal(await store.health(), true);

  const todo = await store.create('integration');
  created.push(todo.id);
  assert.equal(typeof todo.id, 'number');
  assert.equal(new Date(todo.createdAt).toISOString(), todo.createdAt);

  const other = await store.create('integration 2');
  created.push(other.id);
  const ids = (await store.list()).map((t) => t.id);
  assert.ok(ids.indexOf(todo.id) < ids.indexOf(other.id));
  assert.deepEqual([...ids].sort((a, b) => a - b), ids);

  await Promise.all([store.update(todo.id, { title: 'renamed' }), store.update(todo.id, { done: true })]);
  const stored = (await store.list()).find((t) => t.id === todo.id);
  assert.deepEqual(stored, { ...todo, title: 'renamed', done: true });

  assert.equal(await store.remove(other.id), true);
  assert.equal(await store.remove(other.id), false);
});
