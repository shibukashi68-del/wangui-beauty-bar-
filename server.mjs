// Wangui Beauty Bar — application entry point.
//
// This file is deliberately thin: it wires configuration, infrastructure
// (pool, sessions, rate limits, logging) and routes together, then manages
// the server lifecycle. Business logic lives in lib/ modules.
//
// Run: npm start   (requires migrations applied — see README.md)

import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log, withLogging } from './lib/logging.mjs';
import { createPool, BookingStore } from './lib/bookings.mjs';
import { RateLimiter } from './lib/sessions.mjs';
import { VideoCatalogue, serveStatic } from './lib/static.mjs';
import { Router, dispatch } from './lib/router.mjs';
import { validateBooking } from './lib/scheduling.mjs';
import { json } from './lib/http.mjs';
import { OwnerVideoService } from './lib/owner-videos.mjs';

// ─── Configuration guard ─────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Infrastructure ──────────────────────────────────────────────────
function createSerialQueue() {
  let queue = Promise.resolve();
  return function enqueue(task) {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  };
}

const pool = createPool();
const store = new BookingStore({ pool, serialQueue: createSerialQueue() });
const bookingLimiter = new RateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });
const ownerLoginLimiter = new RateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const ownerVideos = new OwnerVideoService({ pool });

const videoCatalogue = new VideoCatalogue({
  cataloguePath: resolve(ROOT, process.env.VIDEO_CATALOGUE_PATH || 'css/videos.json'),
  pool,
});

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

async function readJsonBody(req, limit = 16_384) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > limit) {
      throw Object.assign(new Error('Request is too large.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON request.'), { status: 400 });
  }
}

function assertSameOrigin(req) {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site') {
    throw Object.assign(new Error('Cross-site requests are not allowed.'), { status: 403 });
  }
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    throw Object.assign(new Error('Invalid request origin.'), { status: 403 });
  }
  if (originHost !== String(req.headers.host || '').toLowerCase()) {
    throw Object.assign(new Error('Cross-origin requests are not allowed.'), { status: 403 });
  }
}

// ─── Routes ──────────────────────────────────────────────────────────
const router = new Router();

router.get('/api/health', async (req, res) => {
  await store.ping();
  json(res, 200, { ok: true, database: 'connected' });
});

router.post('/api/bookings', async (req, res) => {
  if (bookingLimiter.take(clientIp(req))) {
    return json(res, 429, { error: 'Too many requests from this connection. Please try again later.' });
  }
  const details = validateBooking(await readJsonBody(req));
  if (typeof details === 'string') return json(res, 400, { error: details });
  const saved = await store.create(details);
  if (!saved) return json(res, 409, { error: 'That time was just requested. Please choose another time.' });
  json(res, 201, { booking: saved, confirmation: 'Request received. The salon will confirm your appointment in WhatsApp.' });
});

router.get('/api/videos', async (req, res) => {
  json(res, 200, { videos: await videoCatalogue.load() });
});

router.get('/api/admin/config', async (req, res) => {
  json(res, 200, { configured: ownerVideos.configured });
});

router.post('/api/admin/session', async (req, res) => {
  if (ownerLoginLimiter.take(clientIp(req))) {
    return json(res, 429, { error: 'Too many sign-in attempts. Please wait before trying again.' });
  }
  assertSameOrigin(req);
  json(res, 200, await ownerVideos.signIn(req, res, await readJsonBody(req)));
});

router.get('/api/admin/session', async (req, res) => {
  const { user } = await ownerVideos.authenticate(req, res);
  json(res, 200, { signedIn: true, email: user.email });
});

router.delete('/api/admin/session', async (req, res) => {
  assertSameOrigin(req);
  json(res, 200, await ownerVideos.signOut(req, res));
});

router.get('/api/admin/videos', async (req, res) => {
  await ownerVideos.authenticate(req, res);
  json(res, 200, { videos: await ownerVideos.list() });
});

router.post('/api/admin/videos', async (req, res) => {
  assertSameOrigin(req);
  const context = await ownerVideos.authenticate(req, res);
  const metadata = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  if (metadata.published === 'true') metadata.published = true;
  else if (metadata.published === 'false') metadata.published = false;
  json(res, 201, { video: await ownerVideos.upload(context, req, metadata) });
});

router.patch('/api/admin/videos/:id', async (req, res, { id }) => {
  assertSameOrigin(req);
  await ownerVideos.authenticate(req, res);
  json(res, 200, { video: await ownerVideos.update(id, await readJsonBody(req)) });
});

router.delete('/api/admin/videos/:id', async (req, res, { id }) => {
  assertSameOrigin(req);
  const context = await ownerVideos.authenticate(req, res);
  json(res, 200, await ownerVideos.delete(context, id));
});

// ─── Request pipeline ────────────────────────────────────────────────
async function handle(req, res, requestId) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    const matched = dispatch(router, req, res, url.pathname);
    if (matched) {
      await matched.handler(req, res, matched.params);
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return await serveStatic(req, res, url.pathname, { root: ROOT });
    }
    res.writeHead(405, {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: 'GET, HEAD, POST',
    });
    return res.end(JSON.stringify({ error: 'Method not allowed.' }));
  } catch (error) {
    log.error('request.failed', {
      request_id: requestId,
      method: req.method,
      path: url.pathname,
      error: error?.message || String(error),
      stack: IS_PROD ? undefined : error?.stack,
    });
    const status = error?.status || 500;
    if (!res.headersSent) {
      json(res, status, { error: status === 500 ? 'Server error. Please try again.' : error.message });
    } else {
      res.destroy();
    }
  }
}

const server = createServer(withLogging(handle));

// Slow-loris hardening: bound how long a client may hold a connection open.
server.requestTimeout = 60_000;
server.headersTimeout = 30_000;
server.keepAliveTimeout = 15_000;

// ─── Startup ─────────────────────────────────────────────────────────
// Fail fast and legibly when the schema gate cannot pass: a misconfigured
// database should never start a half-working server.
try {
  await store.verifySchema();
} catch (error) {
  log.error('startup.schema_check_failed', {
    hint: 'Check PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (or DATABASE_URL) and run "npm run migrate" before starting.',
    error: error?.message || String(error),
  });
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  log.info('server.listening', { port: PORT, env: IS_PROD ? 'production' : 'development' });
});

// ─── Graceful shutdown ───────────────────────────────────────────────
// Stop accepting new connections, drain in-flight requests, then close the
// pool. A second signal escalates so a stuck deploy cannot hang.
const SHUTDOWN_TIMEOUT_MS = 30_000;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    log.warn('shutdown.escalated', { signal });
    process.exit(1);
  }
  shuttingDown = true;
  log.info('shutdown.begin', { signal });

  const forceExit = setTimeout(() => {
    log.error('shutdown.timeout', { timeout_ms: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref?.();

  await new Promise((accept) => server.close(accept));
  await store.close().catch((error) => log.error('shutdown.pool_close_failed', { error: error.message }));
  log.info('shutdown.complete', {});
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  log.error('process.unhandled_rejection', { error: reason?.message || String(reason) });
});
process.on('uncaughtException', (error) => {
  log.error('process.uncaught_exception', { error: error?.message || String(error) });
  void shutdown('uncaughtException');
});
