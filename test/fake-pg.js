import { EventEmitter } from 'node:events';

// In-memory stand-in for pg.Pool that understands only the statements store.js issues.
export function createFakePool() {
  const pool = new EventEmitter();
  let table = null;
  let nextId = 1;

  pool.queries = [];
  pool.released = 0;
  pool.ended = false;
  pool.failHealth = false;
  pool.failCreate = false;

  function requireTable() {
    if (!table) throw Object.assign(new Error('relation "todos" does not exist'), { code: '42P01' });
    return table;
  }

  function copy(row) {
    return { ...row, created_at: new Date(row.created_at) };
  }

  async function query(text, params = []) {
    pool.queries.push({ text, params });
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql === 'SELECT 1') {
      if (pool.failHealth) throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.startsWith('SELECT pg_advisory_xact_lock(')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS todos ')) {
      if (pool.failCreate) throw Object.assign(new Error('permission denied'), { code: '42501' });
      table ??= new Map();
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'SELECT id, title, done, created_at FROM todos ORDER BY id ASC') {
      const rows = [...requireTable().values()].sort((a, b) => Number(a.id) - Number(b.id)).map(copy);
      return { rows, rowCount: rows.length };
    }
    if (sql === 'INSERT INTO todos (title) VALUES ($1) RETURNING id, title, done, created_at') {
      // pg returns bigint columns as strings.
      const row = { id: String(nextId++), title: params[0], done: false, created_at: new Date() };
      requireTable().set(row.id, row);
      return { rows: [copy(row)], rowCount: 1 };
    }
    if (
      sql ===
      'UPDATE todos SET title = COALESCE($2, title), done = COALESCE($3, done) WHERE id = $1 RETURNING id, title, done, created_at'
    ) {
      const row = requireTable().get(String(params[0]));
      if (!row) return { rows: [], rowCount: 0 };
      if (params[1] !== null) row.title = params[1];
      if (params[2] !== null) row.done = params[2];
      return { rows: [copy(row)], rowCount: 1 };
    }
    if (sql === 'DELETE FROM todos WHERE id = $1') {
      const deleted = requireTable().delete(String(params[0]));
      return { rows: [], rowCount: deleted ? 1 : 0 };
    }
    throw new Error(`fake pool: unexpected SQL: ${sql}`);
  }

  pool.query = query;
  pool.connect = async () => ({
    query,
    release() {
      pool.released += 1;
    },
  });
  pool.end = async () => {
    pool.ended = true;
  };
  return pool;
}
