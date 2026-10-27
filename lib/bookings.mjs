// Database access layer: pool, schema gate, booking persistence.
// All writes to bookings and the video catalogue flow through a serial queue
// to keep their read-modify-write sequences atomic.

import { randomBytes } from 'node:crypto';
import pg from 'pg';

export class BookingStore {
  constructor({ pool, serialQueue }) {
    this.pool = pool;
    this.enqueue = serialQueue;
    this.requiredSchemaVersion = '002_create_owner_videos';
  }

  async verifySchema() {
    try {
      const result = await this.pool.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [this.requiredSchemaVersion],
      );
      if (!result.rowCount) {
        throw new Error(`Required database migration ${this.requiredSchemaVersion} has not been applied.`);
      }
    } catch (error) {
      throw new Error(`Database schema is not ready. Run "npm run migrate" before starting the server. ${error.message}`);
    }
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  mapBooking(row) {
    return {
      id: row.id, name: row.name, phone: row.phone, serviceId: row.service_id,
      service: row.service, date: String(row.booking_date).slice(0, 10),
      time: String(row.booking_time).slice(0, 5), notes: row.notes,
      status: row.status, createdAt: new Date(row.created_at).toISOString(),
      ...(row.updated_at ? { updatedAt: new Date(row.updated_at).toISOString() } : {}),
    };
  }

  async create(details) {
    return this.enqueue(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [details.date]);
        const conflict = await client.query(`
          SELECT 1 FROM bookings
          WHERE booking_date = $1 AND status = 'confirmed'
            AND overlap_start < $3 AND overlap_end > $2
          LIMIT 1
        `, [details.date, details.start, details.end]);
        if (conflict.rowCount) {
          await client.query('ROLLBACK');
          return null;
        }
        const result = await client.query(`
          INSERT INTO bookings (id, name, phone, service_id, service, booking_date, booking_time, notes, status, overlap_start, overlap_end)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
          RETURNING *
        `, [randomBytes(12).toString('hex'), details.name, details.phone, details.service.id,
        details.service.name, details.date, details.time, details.notes, details.start, details.end]);
        await client.query('COMMIT');
        return this.mapBooking(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async close() {
    await this.pool.end();
  }
}

export function createPool(env = process.env) {
  return new pg.Pool({
    connectionString: env.DATABASE_URL || undefined,
    host: env.DATABASE_URL ? undefined : (env.PGHOST || '127.0.0.1'),
    port: env.DATABASE_URL ? undefined : Number(env.PGPORT || 5432),
    user: env.DATABASE_URL ? undefined : (env.PGUSER || 'postgres'),
    password: env.DATABASE_URL ? undefined : env.PGPASSWORD,
    database: env.DATABASE_URL ? undefined : (env.PGDATABASE || 'wangui_beauty_bar'),
    connectionTimeoutMillis: 5000,
    max: 10,
  });
}
