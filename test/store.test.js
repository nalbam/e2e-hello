import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREATE_TABLE, DATABASE_URL_ENV, createPostgresStore, createStoreFromEnv } from '../store.js';
import { createFakePool } from './fake-pg.js';

async function readyStore() {
  const pool = createFakePool();
  const store = createPostgresStore(pool);
  await store.init();
  pool.queries.length = 0;
  return { pool, store };
}

test('CREATE TABLE is idempotent and defines the todos schema', () => {
  assert.match(CREATE_TABLE, /^CREATE TABLE IF NOT EXISTS todos \(/);
  assert.match(CREATE_TABLE, /id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
  assert.match(CREATE_TABLE, /title text NOT NULL/);
  assert.match(CREATE_TABLE, /done boolean NOT NULL DEFAULT false/);
  assert.match(CREATE_TABLE, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
});

test('init creates the table in a transaction under an advisory lock', async () => {
  const pool = createFakePool();
  const store = createPostgresStore(pool);
  await store.init();
  assert.deepEqual(
    pool.queries.map((q) => q.text.split(/[\s(]/)[0] === 'CREATE' ? 'CREATE' : q.text),
    ['BEGIN', 'SELECT pg_advisory_xact_lock($1)', 'CREATE', 'COMMIT'],
  );
  assert.equal(pool.queries[2].text, CREATE_TABLE);
  assert.equal(pool.released, 1);

  await store.init();
  assert.equal(pool.released, 2);
});

test('init failure rolls back, releases the client and rethrows', async () => {
  const pool = createFakePool();
  pool.failCreate = true;
  const store = createPostgresStore(pool);
  await assert.rejects(store.init(), { code: '42501' });
  assert.equal(pool.queries.at(-1).text, 'ROLLBACK');
  assert.equal(pool.released, 1);
});

test('queries fail before the table is migrated', async () => {
  const store = createPostgresStore(createFakePool());
  await assert.rejects(store.list(), { code: '42P01' });
});

test('health runs SELECT 1 and reports database errors as unhealthy', async () => {
  const { pool, store } = await readyStore();
  assert.equal(await store.health(), true);
  pool.failHealth = true;
  assert.equal(await store.health(), false);
  assert.deepEqual(
    pool.queries.map((q) => q.text),
    ['SELECT 1', 'SELECT 1'],
  );
});

test('CRUD maps rows to the API shape with parameterized SQL', async () => {
  const { pool, store } = await readyStore();

  const first = await store.create('first');
  assert.deepEqual(pool.queries.at(-1).params, ['first']);
  assert.equal(first.id, 1);
  assert.equal(typeof first.id, 'number');
  assert.equal(first.title, 'first');
  assert.equal(first.done, false);
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);

  const second = await store.create('second');
  assert.deepEqual(await store.list(), [first, second]);
  assert.match(pool.queries.at(-1).text, /ORDER BY id ASC$/);

  assert.deepEqual(await store.update(first.id, { done: true }), { ...first, done: true });
  assert.deepEqual(pool.queries.at(-1).params, [first.id, null, true]);
  assert.deepEqual(await store.update(first.id, { title: 'renamed' }), { ...first, title: 'renamed', done: true });
  assert.deepEqual(pool.queries.at(-1).params, [first.id, 'renamed', null]);
  assert.equal(await store.update(999, { done: true }), null);

  assert.equal(await store.remove(first.id), true);
  assert.deepEqual(pool.queries.at(-1).params, [first.id]);
  assert.equal(await store.remove(first.id), false);
  assert.deepEqual(await store.list(), [second]);
});

test('concurrent updates each use one UPDATE ... RETURNING and keep both fields', async () => {
  const { pool, store } = await readyStore();
  const todo = await store.create('original');
  pool.queries.length = 0;

  const [a, b] = await Promise.all([
    store.update(todo.id, { title: 'renamed' }),
    store.update(todo.id, { done: true }),
  ]);

  assert.equal(pool.queries.length, 2);
  for (const { text } of pool.queries) {
    assert.match(text, /^UPDATE todos SET title = COALESCE\(\$2, title\), done = COALESCE\(\$3, done\) WHERE id = \$1 RETURNING /);
  }
  assert.equal(a.title, 'renamed');
  assert.equal(b.done, true);
  assert.deepEqual(await store.list(), [{ ...todo, title: 'renamed', done: true }]);
});

test('close ends the pool', async () => {
  const { pool, store } = await readyStore();
  await store.close();
  assert.equal(pool.ended, true);
});

test('createStoreFromEnv requires the database URL', async () => {
  assert.throws(() => createStoreFromEnv({}), new RegExp(`${DATABASE_URL_ENV} is required`));
  assert.throws(() => createStoreFromEnv({ [DATABASE_URL_ENV]: '' }), /is required/);

  const store = createStoreFromEnv({ [DATABASE_URL_ENV]: 'postgres://user:pass@127.0.0.1:1/db' });
  assert.equal(store.kind, 'postgres');
  await store.close();
});
