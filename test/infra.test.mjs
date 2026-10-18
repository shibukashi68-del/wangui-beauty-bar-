// Unit tests for infrastructure helpers: rate limiter, sessions, logging.
// Run: node --test test/infra.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { MemorySessionStore } from '../lib/sessions.mjs';
import { RateLimiter } from '../lib/sessions.mjs';
import { logger, log } from '../lib/logging.mjs';
import { withLogging } from '../lib/logging.mjs';
import { json } from '../lib/http.mjs';
import { Router, dispatch } from '../lib/router.mjs';

// ─── RateLimiter ─────────────────────────────────────────────────────
test('RateLimiter allows requests below the limit', () => {
  const limiter = new RateLimiter({ max: 3, windowMs: 1000 });
  assert.equal(limiter.take('ip1'), false);
  assert.equal(limiter.take('ip1'), false);
  assert.equal(limiter.take('ip1'), false);
});

test('RateLimiter blocks once the limit is exceeded', () => {
  const limiter = new RateLimiter({ max: 2, windowMs: 1000 });
  limiter.take('ip1');
  limiter.take('ip1');
  assert.equal(limiter.take('ip1'), true);
  // A different key is unaffected.
  assert.equal(limiter.take('ip2'), false);
});

test('RateLimiter resets after the window expires', async () => {
  const limiter = new RateLimiter({ max: 1, windowMs: 10 });
  assert.equal(limiter.take('ip1'), false);
  assert.equal(limiter.take('ip1'), true);
  await new Promise((accept) => setTimeout(accept, 15));
  assert.equal(limiter.take('ip1'), false);
});

test('RateLimiter.reset clears an address manually', () => {
  const limiter = new RateLimiter({ max: 1, windowMs: 10_000 });
  limiter.take('ip1');
  assert.equal(limiter.take('ip1'), true);
  limiter.reset('ip1');
  assert.equal(limiter.take('ip1'), false);
});

test('RateLimiter prunes the map when it grows past 5000 entries', () => {
  const limiter = new RateLimiter({ max: 1, windowMs: 1 });
  for (let i = 0; i < 5100; i += 1) limiter.take(`ip-${i}`);
  assert.ok(limiter.size < 5000);
});

// ─── MemorySessionStore ──────────────────────────────────────────────
test('session round-trips through touch', () => {
  const sessions = new MemorySessionStore({ ttlMs: 10_000 });
  const id = sessions.create();
  assert.equal(sessions.touch(id) instanceof Object, true);
  assert.equal(sessions.touch('nope'), null);
});

test('session slides the expiry forward on each touch', () => {
  const sessions = new MemorySessionStore({ ttlMs: 10_000 });
  const id = sessions.create();
  const first = sessions.touch(id).expires;
  const second = sessions.touch(id).expires;
  assert.ok(second > first);
});

test('session touch after destruction returns null', () => {
  const sessions = new MemorySessionStore({ ttlMs: 10_000 });
  const id = sessions.create();
  sessions.destroy(id);
  assert.equal(sessions.touch(id), null);
});

test('session close destroys every session', async () => {
  const sessions = new MemorySessionStore({ ttlMs: 10_000 });
  const id = sessions.create();
  await sessions.close();
  assert.equal(sessions.touch(id), null);
});

// ─── Logging ─────────────────────────────────────────────────────────
function captureLogs() {
  const entries = [];
  const fakeLogger = logger.create({ write: (msg) => entries.push(JSON.parse(msg)) });
  return { entries, fakeLogger };
}

test('logger emits a single JSON line per event with ISO timestamp', () => {
  const { entries, fakeLogger } = captureLogs();
  fakeLogger.info('test.event', { key: 'value' });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].event, 'test.event');
  assert.equal(entries[0].key, 'value');
  assert.ok(!Number.isNaN(Date.parse(entries[0].time)));
  assert.ok(/\d{4}-\d{2}-\d{2}T/.test(entries[0].time));
});

test('logger redacts secrets and cookies in any log entry', () => {
  const { entries, fakeLogger } = captureLogs();
  fakeLogger.info('login', { password: 'hunter2', cookie: 'a=b', secret: 'x', ok: 1 });
  assert.equal(entries[0].password, '[redacted]');
  assert.equal(entries[0].cookie, '[redacted]');
  assert.equal(entries[0].secret, '[redacted]');
  assert.equal(entries[0].ok, 1);
});

test('logger withLogging assigns a unique request id and restores status', async () => {
  const { entries, fakeLogger } = captureLogs();
  const statuses = [];
  const handler = withLogging(async (req, res) => {
    const id = fakeLogger.context.requestId;
    statuses.push(id);
    res.writeHead(503, {});
    res.end();
  }, fakeLogger);
  await handler({}, { writeHead: () => { }, end: () => { } });
  assert.equal(entries.length, 2); // request + response
  assert.notEqual(entries[0].request_id, entries[1].request_id);
  assert.equal(entries[1].status, 503);
  assert.ok(statuses[0]);
});

test('default log writes to stdout without throwing', () => {
  assert.doesNotThrow(() => log.info('smoke.test', {}));
});

// ─── json() helper ───────────────────────────────────────────────────
test('json writes status, content type and body', () => {
  let written = '';
  const headers = {};
  const fake = {
    writeHead(status, h) { this.status = status; Object.assign(headers, h); },
    end(body) { written = body || ''; },
  };
  json(fake, 201, { ok: true }, { 'X-Custom': 'yes' });
  assert.equal(fake.status, 201);
  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['X-Custom'], 'yes');
  assert.equal(written, '{"ok":true}');
});

// ─── Router ──────────────────────────────────────────────────────────
test('Router dispatches GET routes with params', async () => {
  const router = new Router();
  let received;
  router.get('/api/bookings/:id', async (req, res, { params }) => { received = params; });
  const match = dispatch(router, { method: 'GET' }, {}, '/api/bookings/abc123');
  assert.notEqual(match, null);
  await match.handler({}, {}, { params: match.params });
  assert.deepEqual(received, { id: 'abc123' });
});

test('Router dispatches POST routes', async () => {
  const router = new Router();
  let called = false;
  router.post('/api/bookings', async () => { called = true; });
  const match = dispatch(router, { method: 'POST' }, {}, '/api/bookings');
  await match.handler();
  assert.equal(called, true);
});

test('Router returns null for unknown paths and methods', () => {
  const router = new Router();
  router.get('/api/x', async () => { });
  assert.equal(dispatch(router, { method: 'GET' }, {}, '/api/y'), null);
  assert.equal(dispatch(router, { method: 'POST' }, {}, '/api/x'), null);
});
