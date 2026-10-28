import pg from 'pg';
import { loadEnv } from './lib/env.mjs';

await loadEnv();

const { Pool } = pg;
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const connectionString = process.env.DATABASE_URL || '';
const databaseName = connectionString
  ? decodeURIComponent(new URL(connectionString).pathname.slice(1))
  : (process.env.PGDATABASE || 'wangui_beauty_bar');
const isTestDatabase = /test|stage/i.test(databaseName);
const pool = new Pool({
  connectionString: connectionString || undefined,
  host: connectionString ? undefined : (process.env.PGHOST || '127.0.0.1'),
  port: connectionString ? undefined : Number(process.env.PGPORT || 5432),
  user: connectionString ? undefined : (process.env.PGUSER || 'postgres'),
  password: connectionString ? undefined : process.env.PGPASSWORD,
  database: connectionString ? undefined : databaseName,
  connectionTimeoutMillis: 5000,
  max: 2,
});

let failures = 0;
const token = `verification-${Date.now()}`;
const booking = {
  name: 'Booking API Verification',
  phone: '+254700000001',
  serviceId: 'wig-install',
  date: nextMondayNairobi(),
  time: '10:00',
  notes: token,
};

function check(name, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!passed) failures += 1;
}

function nextMondayNairobi() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  const daysUntilMonday = (8 - date.getUTCDay()) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilMonday);
  return date.toISOString().slice(0, 10);
}

async function createBooking() {
  return fetch(new URL('/api/bookings', API_BASE_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(booking),
  });
}

try {
  if (!isTestDatabase) throw new Error('Refusing to run unless PGDATABASE or DATABASE_URL names a test/staging database.');

  const firstResponse = await createBooking();
  check('create a public booking request', firstResponse.status === 201, String(firstResponse.status));
  if (firstResponse.status !== 201) throw new Error('First booking request failed.');
  const first = (await firstResponse.json()).booking;

  const secondResponse = await createBooking();
  check('accept another request for the same preferred time', secondResponse.status === 201, String(secondResponse.status));
  if (secondResponse.status !== 201) throw new Error('Overlapping pending requests should not block public submissions.');
  check('booking requests cannot be publicly read',
    (await fetch(new URL('/api/bookings', API_BASE_URL))).status === 404);
  check('booking status changes are unavailable',
    (await fetch(new URL(`/api/bookings/${first.id}`, API_BASE_URL), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed' }),
    })).status === 405);
} catch (error) {
  console.error('Booking API verification error:', error.message);
  failures += 1;
} finally {
  if (isTestDatabase) {
    try {
      const result = await pool.query('DELETE FROM bookings WHERE notes = $1 AND name = $2', [token, booking.name]);
      if (result.rowCount) console.log(`Removed ${result.rowCount} temporary test booking(s).`);
    } catch (error) {
      console.error('Could not clean up test bookings:', error.message);
      failures += 1;
    }
  }
  await pool.end();
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  if (failures) process.exitCode = 1;
}
