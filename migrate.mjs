import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(ROOT, 'migrations');
const MIGRATION_LOCK_ID = 734921806;

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DATABASE_URL ? undefined : (process.env.PGHOST || '127.0.0.1'),
    port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT || 5432),
    user: process.env.DATABASE_URL ? undefined : (process.env.PGUSER || 'postgres'),
    password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD,
    database: process.env.DATABASE_URL ? undefined : (process.env.PGDATABASE || 'wangui_beauty_bar'),
    connectionTimeoutMillis: 5000,
    max: 2,
  });
}

function migrationVersion(filename) {
  const match = filename.match(/^(\d{3}_[a-z0-9_-]+)\.sql$/);
  if (!match) throw new Error(`Invalid migration filename: ${filename}`);
  return match[1];
}

async function migrate() {
  const pool = createPool();
  let client;

  try {
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    let entries;
    try {
      entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Unable to read migrations directory at ${MIGRATIONS_DIR}: ${error.message}`);
    }

    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
      .map((entry) => entry.name)
      .sort();

    if (!files.length) throw new Error('No SQL migrations were found in migrations/.');

    for (const filename of files) {
      const version = migrationVersion(filename);
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount) {
        console.log(`Already applied: ${version}`);
        continue;
      }

      await client.query('BEGIN');
      try {
        const sql = await fs.readFile(resolve(MIGRATIONS_DIR, filename), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`Applied: ${version}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
  } catch (error) {
    const detail = error?.message || String(error);
    console.error('Database migration failed:', detail);
    if (error?.code === 'ECONNREFUSED') {
      console.error('Check that the PostgreSQL service is running and PGHOST/PGPORT point to it.');
    } else if (error?.code === '28P01' || error?.code === 'invalid_authorization_specification') {
      console.error('PostgreSQL rejected the login. Check PGUSER and re-enter that user’s password.');
    } else if (error?.code === '3D000') {
      console.error('The database does not exist. Create PGDATABASE in pgAdmin, then run the local startup script again.');
    } else if (error?.code === '42501') {
      console.error('The PostgreSQL role lacks permission to create or update the schema. Grant the required database/schema permissions or use an authorized role.');
    }
    process.exitCode = 1;
    throw error;
  } finally {
    if (client) {
      try {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_ID]).catch(() => {});
      } finally {
        client.release();
      }
    }
    await pool.end().catch(() => {});
  }
}

try {
  await migrate();
} catch {
  // Migration failures are already logged above.
}
