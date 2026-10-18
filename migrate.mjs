import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(ROOT, 'migrations');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DATABASE_URL ? undefined : (process.env.PGHOST || '127.0.0.1'),
  port: process.env.DATABASE_URL ? undefined : Number(process.env.PGPORT || 5432),
  user: process.env.DATABASE_URL ? undefined : (process.env.PGUSER || 'postgres'),
  password: process.env.DATABASE_URL ? undefined : process.env.PGPASSWORD,
  database: process.env.DATABASE_URL ? undefined : (process.env.PGDATABASE || 'wangui_beauty_bar'),
  connectionTimeoutMillis: 5000,
  max: 2,
});
const MIGRATION_LOCK_ID = 734921806;

function migrationVersion(filename) {
  const match = filename.match(/^(\d{3}_[a-z0-9_-]+)\.sql$/);
  if (!match) throw new Error(`Invalid migration filename: ${filename}`);
  return match[1];
}

const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
  if (!files.length) throw new Error('No SQL migrations were found.');

  for (const filename of files) {
    const version = migrationVersion(filename);
    await client.query('BEGIN');
    try {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (applied.rowCount) {
        await client.query('COMMIT');
        console.log(`Already applied: ${version}`);
        continue;
      }
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
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
  client.release();
  await pool.end();
}
