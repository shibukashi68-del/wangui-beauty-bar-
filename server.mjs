// Wangui Beauty Bar — application entry point.
//
// This file is deliberately thin: it wires configuration, infrastructure
// (pool, sessions, rate limits, logging) and routes together, then manages
// the server lifecycle. Business logic lives in lib/ modules.
//
// Run: npm start   (requires migrations applied — see README.md)

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

import { log, withLogging } from './lib/logging.mjs';
import { createPool, BookingStore } from './lib/bookings.mjs';
import { MemorySessionStore, RateLimiter } from './lib/sessions.mjs';
import { VideoCatalogue, VIDEO_DEPTS, serveStatic } from './lib/static.mjs';
import { Router, dispatch } from './lib/router.mjs';
import { validateBooking, isValidStatus } from './lib/scheduling.mjs';
import { parseMultipart } from './lib/multipart.mjs';
import { json } from './lib/http.mjs';

// ─── Configuration guard ─────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const IS_PROD = process.env.NODE_ENV === 'production';

if (IS_PROD && (ADMIN_PASSWORD.length < 12 || Buffer.byteLength(ADMIN_PASSWORD) > 200)) {
  log.error('startup.invalid_admin_password', {
    hint: 'Production requires a unique ADMIN_PASSWORD between 12 and 200 bytes.',
  });
  process.exit(1);
}

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
const sessions = new MemorySessionStore({ ttlMs: 12 * 60 * 60 * 1000 });
const loginLimiter = new RateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const bookingLimiter = new RateLimiter({ max: 30, windowMs: 60 * 60 * 1000 });

const configuredVideoLimit = Number(process.env.MAX_VIDEO_UPLOAD_BYTES);
const videoCatalogue = new VideoCatalogue({
  dir: resolve(ROOT, process.env.VIDEO_STORAGE_DIR || 'video'),
  cataloguePath: resolve(ROOT, process.env.VIDEO_CATALOGUE_PATH || 'css/videos.json'),
  maxUploadBytes: Number.isSafeInteger(configuredVideoLimit) && configuredVideoLimit > 0
    ? configuredVideoLimit
    : 100 * 1024 * 1024,
});

const uploadTempDir = resolve(ROOT, '.tmp-uploads');

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function sessionFor(req) {
  const cookies = (req.headers.cookie || '').split(';');
  const entry = cookies.map((v) => v.trim()).find((v) => v.startsWith('wbb_session='));
  const id = entry ? decodeURIComponent(entry.slice('wbb_session='.length)) : '';
  return sessions.touch(id) ? id : null;
}

function requireAdmin(req, res) {
  if (sessionFor(req)) return true;
  json(res, 401, { error: 'Please sign in again.' });
  return false;
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

// ─── Routes ──────────────────────────────────────────────────────────
const router = new Router();

router.get('/api/health', async (req, res) => {
  await store.ping();
  json(res, 200, { ok: true, database: 'connected' });
});

router.get('/api/admin/session', async (req, res) => {
  json(res, 200, { authenticated: Boolean(sessionFor(req)) });
});

router.post('/api/admin/login', async (req, res) => {
  if (ADMIN_PASSWORD.length < 12) {
    return json(res, 503, { error: 'Set ADMIN_PASSWORD to a unique password of at least 12 characters.' });
  }
  const ip = clientIp(req);
  if (loginLimiter.take(ip)) {
    return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
  }
  const body = await readJsonBody(req);
  const provided = typeof body.password === 'string' ? body.password : '';
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(ADMIN_PASSWORD);
  const matches = providedBytes.length <= 200
    && providedBytes.length === expectedBytes.length
    && timingSafeEqual(providedBytes, expectedBytes);
  if (!matches) {
    return json(res, 401, { error: 'Password was not accepted.' });
  }
  loginLimiter.reset(ip);
  const id = sessions.create();
  const secure = IS_PROD ? '; Secure' : '';
  json(res, 200, { authenticated: true }, {
    'Set-Cookie': `wbb_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`,
  });
});

router.post('/api/admin/logout', async (req, res) => {
  const id = sessionFor(req);
  if (id) sessions.destroy(id);
  json(res, 200, { ok: true }, {
    'Set-Cookie': 'wbb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
  });
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

router.get('/api/bookings', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  json(res, 200, { bookings: await store.list() });
});

router.patch('/api/bookings/:id', async (req, res, { id }) => {
  if (!requireAdmin(req, res)) return;
  if (!/^[a-f0-9]{24}$/.test(id)) return json(res, 400, { error: 'Choose a valid booking status.' });
  const body = await readJsonBody(req);
  if (!isValidStatus(body.status)) return json(res, 400, { error: 'Choose a valid booking status.' });
  const result = await store.updateStatus(id, body.status);
  if (result.notFound) return json(res, 404, { error: 'Booking not found.' });
  if (result.conflict) {
    return json(res, 409, { error: 'That time now overlaps another active booking. Choose another time before confirming this request.' });
  }
  json(res, 200, { booking: result.booking });
});

router.get('/api/videos', async (req, res) => {
  json(res, 200, { videos: await videoCatalogue.load() });
});

router.post('/api/videos', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > videoCatalogue.maxRequestBytes) {
    return json(res, 413, { error: `Video upload is too large. The maximum file size is ${videoCatalogue.label}.` });
  }
  const { fields, files } = await parseMultipart(req, {
    maxBytes: videoCatalogue.maxUploadBytes,
    tempDir: uploadTempDir,
  });
  const file = files.find((f) => f.fieldName === 'video');
  if (!file) return json(res, 400, { error: 'No video file provided.' });
  try {
    if (!file.filename.toLowerCase().endsWith('.mp4')) {
      return json(res, 400, { error: 'Only .mp4 video files are accepted.' });
    }
    if (file.size > videoCatalogue.maxUploadBytes) {
      return json(res, 413, { error: `Video upload is too large. The maximum file size is ${videoCatalogue.label}.` });
    }
    // MP4 magic bytes: bytes 4..8 of a valid ISO base media file are 'ftyp'.
    const handle = await fs.open(file.path, 'r');
    try {
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
      if (bytesRead < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') {
        return json(res, 400, { error: 'The uploaded file does not appear to be a valid MP4 video.' });
      }
    } finally {
      await handle.close();
    }
    const dept = fields.dept || '';
    if (!VIDEO_DEPTS.includes(dept)) {
      return json(res, 400, { error: 'Choose a valid department.' });
    }
    const caption = fields.caption || file.filename;
    if (caption.length > 200) {
      return json(res, 400, { error: 'Caption must be 200 characters or fewer.' });
    }
    const safeName = videoCatalogue.saveName(file.filename);
    if (!safeName.toLowerCase().endsWith('.mp4')) {
      return json(res, 400, { error: 'Use a filename containing only standard letters, numbers, dots, underscores, or hyphens.' });
    }
    const saved = await saveUploadedVideo({ file, safeName, dept, caption });
    if (!saved) {
      return json(res, 409, { error: 'A video with that filename already exists. Rename the file and try again.' });
    }
    json(res, 201, { video: { file: safeName, dept, caption } });
  } finally {
    if (file.path.startsWith(uploadTempDir)) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
});

router.delete('/api/videos/:filename', async (req, res, { filename }) => {
  if (!requireAdmin(req, res)) return;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  const deleted = await deleteVideo(safeName);
  if (!deleted) return json(res, 404, { error: 'Video not found.' });
  json(res, 200, { ok: true });
});

// ─── Video persistence (serialised, like bookings) ───────────────────
const videoQueue = createSerialQueue();

async function saveUploadedVideo({ file, safeName, dept, caption }) {
  return videoQueue(async () => {
    const videos = await videoCatalogue.load();
    if (videos.some((video) => video.file === safeName)) return false;
    await fs.mkdir(videoCatalogue.dir, { recursive: true });
    const destPath = resolve(videoCatalogue.dir, safeName);
    try {
      await fs.rename(file.path, destPath);
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
    videos.push({ file: safeName, dept, caption });
    try {
      await videoCatalogue.save(videos);
    } catch (error) {
      await fs.unlink(destPath).catch(() => {});
      throw error;
    }
    return true;
  });
}

async function deleteVideo(filename) {
  return videoQueue(async () => {
    const videos = await videoCatalogue.load();
    if (!videos.some((video) => video.file === filename)) return false;
    const updatedVideos = videos.filter((video) => video.file !== filename);
    await videoCatalogue.save(updatedVideos);
    try {
      await fs.unlink(resolve(videoCatalogue.dir, filename));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        await videoCatalogue.save(videos);
        throw error;
      }
    }
    return true;
  });
}

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
      Allow: 'GET, HEAD, POST, PATCH, DELETE',
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
// pool and sessions. A second signal escalates so a stuck deploy cannot hang.
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
  await sessions.close();
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
