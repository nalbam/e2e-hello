import { createClient } from 'redis';

const TODOS = 'todos';
const NEXT_ID = 'todos:next-id';

// The merge runs in Valkey, so two concurrent updates of one todo cannot lose a field.
const UPDATE = `
local stored = redis.call('HGET', KEYS[1], ARGV[1])
if not stored then return false end
local todo = cjson.decode(stored)
for field, value in pairs(cjson.decode(ARGV[2])) do todo[field] = value end
local updated = cjson.encode(todo)
redis.call('HSET', KEYS[1], ARGV[1], updated)
return updated`;

export function createMemoryStore() {
  let nextId = 1;
  const todos = new Map();

  return {
    kind: 'memory',
    async init() {},
    async health() {
      return true;
    },
    async list() {
      return [...todos.values()].map((todo) => ({ ...todo }));
    },
    async create(title) {
      const todo = { id: nextId++, title, done: false, createdAt: new Date().toISOString() };
      todos.set(todo.id, todo);
      return { ...todo };
    },
    async update(id, patch) {
      const todo = todos.get(id);
      if (!todo) return null;
      if (patch.title !== undefined) todo.title = patch.title;
      if (patch.done !== undefined) todo.done = patch.done;
      return { ...todo };
    },
    async remove(id) {
      return todos.delete(id);
    },
    async close() {},
  };
}

export function createValkeyStore(client) {
  client.on('error', (err) => {
    console.error(`valkey client error (${err.code ?? 'unknown'})`);
  });

  return {
    kind: 'valkey',
    async init() {
      try {
        await client.connect();
        console.log('valkey connected');
      } catch (err) {
        console.error(`valkey connection failed (${err.code ?? 'unknown'})`);
      }
    },
    async health() {
      try {
        return (await client.ping()) === 'PONG';
      } catch {
        return false;
      }
    },
    async list() {
      const stored = await client.hVals(TODOS);
      return stored.map((todo) => JSON.parse(todo)).sort((a, b) => a.id - b.id);
    },
    async create(title) {
      const id = await client.incr(NEXT_ID);
      const todo = { id, title, done: false, createdAt: new Date().toISOString() };
      await client.hSet(TODOS, String(id), JSON.stringify(todo));
      return todo;
    },
    async update(id, patch) {
      const updated = await client.eval(UPDATE, { keys: [TODOS], arguments: [String(id), JSON.stringify(patch)] });
      return updated ? JSON.parse(updated) : null;
    },
    async remove(id) {
      return (await client.hDel(TODOS, String(id))) > 0;
    },
    async close() {
      if (client.isOpen) client.destroy();
    },
  };
}

export function createStoreFromEnv(env = process.env) {
  if (!env.VALKEY_URL) return createMemoryStore();
  return createValkeyStore(createClient({ url: env.VALKEY_URL, disableOfflineQueue: true, socket: { connectTimeout: 5000 } }));
}
