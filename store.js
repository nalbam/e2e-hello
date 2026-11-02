import pg from 'pg';

export const DATABASE_URL_ENV = 'E2E_HELLO_DB_DATABASE_URL';

// Serializes schema setup across replicas starting at the same time.
const MIGRATION_LOCK_ID = 7_243_001;

export const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS todos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

const COLUMNS = 'id, title, done, created_at';

function toTodo(row) {
  return {
    id: Number(row.id),
    title: row.title,
    done: row.done,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function createPostgresStore(pool) {
  pool.on('error', (err) => {
    console.error(`postgres pool error (${err.code ?? 'unknown'})`);
  });

  return {
    kind: 'postgres',
    async init() {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
        await client.query(CREATE_TABLE);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async health() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async list() {
      const { rows } = await pool.query(`SELECT ${COLUMNS} FROM todos ORDER BY id ASC`);
      return rows.map(toTodo);
    },
    async create(title) {
      const { rows } = await pool.query(`INSERT INTO todos (title) VALUES ($1) RETURNING ${COLUMNS}`, [title]);
      return toTodo(rows[0]);
    },
    // A single UPDATE merges the patch under the row lock, so concurrent updates cannot lose a field.
    async update(id, patch) {
      const { rows } = await pool.query(
        `UPDATE todos SET title = COALESCE($2, title), done = COALESCE($3, done) WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, patch.title ?? null, patch.done ?? null],
      );
      return rows.length > 0 ? toTodo(rows[0]) : null;
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
  const connectionString = env[DATABASE_URL_ENV];
  if (!connectionString) {
    throw new Error(`${DATABASE_URL_ENV} is required (PostgreSQL connection URL)`);
  }
  return createPostgresStore(new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 }));
}
