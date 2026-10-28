import pg from 'pg';

const MIGRATION = `CREATE TABLE IF NOT EXISTS todos (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

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

function toTodo(row) {
  return {
    id: Number(row.id),
    title: row.title,
    done: row.done,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createPgStore(pool) {
  let migrated = false;
  let migrating = null;

  pool.on('error', (err) => {
    console.error(`postgres pool error (${err.code ?? 'unknown'})`);
  });

  function migrate() {
    if (migrated) return Promise.resolve();
    migrating ??= pool
      .query(MIGRATION)
      .then(() => {
        migrated = true;
      })
      .finally(() => {
        migrating = null;
      });
    return migrating;
  }

  return {
    kind: 'postgres',
    async init() {
      try {
        await migrate();
        console.log('postgres migration complete');
      } catch (err) {
        console.error(`postgres migration failed (${err.code ?? 'unknown'})`);
      }
    },
    async health() {
      try {
        await migrate();
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async list() {
      const { rows } = await pool.query(
        'SELECT id, title, done, created_at FROM todos ORDER BY created_at ASC, id ASC',
      );
      return rows.map(toTodo);
    },
    async create(title) {
      const { rows } = await pool.query(
        'INSERT INTO todos (title) VALUES ($1) RETURNING id, title, done, created_at',
        [title],
      );
      return toTodo(rows[0]);
    },
    async update(id, patch) {
      const { rows } = await pool.query(
        `UPDATE todos
            SET title = COALESCE($2, title),
                done = COALESCE($3, done)
          WHERE id = $1
      RETURNING id, title, done, created_at`,
        [id, patch.title ?? null, patch.done ?? null],
      );
      return rows[0] ? toTodo(rows[0]) : null;
    },
    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM todos WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async close() {
      await pool.end();
    },
  };
}

export function createStoreFromEnv(env = process.env) {
  if (!env.DATABASE_URL) return createMemoryStore();
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  return createPgStore(pool);
}
