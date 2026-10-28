// Tests for the remaining audit fixes:
//   - owner video delete rollback when storage deletion fails
//   - proxy-aware client IP for rate limiting
//   - malformed URL escapes on the video static route
//   - normalized public catalogue shape
// Run: node --test test/hardening.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OwnerVideoService } from '../lib/owner-videos.mjs';
import { VideoCatalogue, serveStatic } from '../lib/static.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_ID = '22222222-2222-4222-8222-222222222222';

// ─── Owner video delete rollback ─────────────────────────────────────

function ownerService({ published = true, storageFails = false } = {}) {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/^\s*SELECT object_path/.test(sql)) {
        return { rows: [{ object_path: `owner/${VIDEO_ID}.mp4`, published }] };
      }
      return { rows: [] };
    },
  };
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'DELETE' && storageFails) {
      return new Response('boom', { status: 500 });
    }
    return new Response('{}', { status: 200 });
  };
  const service = new OwnerVideoService({
    pool,
    fetchImpl,
    env: {
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_OWNER_USER_ID: OWNER_ID,
      NODE_ENV: 'production',
    },
  });
  return { service, queries };
}

test('delete removes the row after storage deletion succeeds', async () => {
  const { service, queries } = ownerService();
  const result = await service.delete({ accessToken: 'token' }, VIDEO_ID);
  assert.deepEqual(result, { deleted: true });
  assert.ok(queries.some((q) => /^DELETE FROM owner_videos/.test(q.sql)));
});

test('delete restores the published flag when storage deletion fails', async () => {
  const { service, queries } = ownerService({ published: true, storageFails: true });
  await assert.rejects(
    () => service.delete({ accessToken: 'token' }, VIDEO_ID),
    (error) => error.status === 502,
  );

  // The video must not be left hidden, and the row must not be deleted.
  const restore = queries.find((q) => /SET published = \$3/.test(q.sql));
  assert.ok(restore, 'expected a rollback UPDATE restoring the published flag');
  assert.equal(restore.params[2], true, 'rollback must restore the original value');
  assert.ok(!queries.some((q) => /^DELETE FROM owner_videos/.test(q.sql)), 'row must survive');
});

test('delete restores published=false when the video was already hidden', async () => {
  const { service, queries } = ownerService({ published: false, storageFails: true });
  await assert.rejects(() => service.delete({ accessToken: 'token' }, VIDEO_ID));
  const restore = queries.find((q) => /SET published = \$3/.test(q.sql));
  assert.equal(restore.params[2], false);
});

// ─── Malformed URL escapes ───────────────────────────────────────────

function fakeResponse() {
  return {
    status: null,
    headers: null,
    body: '',
    headersSent: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; return this; },
    end(body) { this.body = body ?? ''; return this; },
  };
}

test('a malformed percent-escape returns 400 instead of throwing', async () => {
  const res = fakeResponse();
  await serveStatic({ method: 'GET', headers: {} }, res, '/video/%ZZ.mp4', { root: ROOT });
  assert.equal(res.status, 400);
  assert.match(res.body, /Malformed URL/);
});

test('a valid video path still serves or 404s normally', async () => {
  const res = fakeResponse();
  // HEAD takes the same header/stat path without piping a file stream.
  await serveStatic({ method: 'HEAD', headers: {} }, res, '/video/hero.mp4', { root: ROOT });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'video/mp4');
});

test('path traversal outside /video is still blocked', async () => {
  const res = fakeResponse();
  await serveStatic({ method: 'GET', headers: {} }, res, '/video/..%2F..%2Fpackage.json', { root: ROOT });
  assert.equal(res.status, 404);
});

// ─── Catalogue shape ─────────────────────────────────────────────────

test('bundled catalogue entries are normalized to the owner shape', async () => {
  const catalogue = new VideoCatalogue({ cataloguePath: resolve(ROOT, 'css/videos.json') });
  const videos = await catalogue.load();
  assert.ok(videos.length > 0);
  for (const video of videos) {
    assert.equal(typeof video.published, 'boolean', `${video.file} needs a boolean published`);
    assert.ok('priceKes' in video, `${video.file} needs priceKes`);
    assert.equal(typeof video.reviewRequired, 'boolean', `${video.file} needs reviewRequired`);
  }
});

test('a catalogue entry explicitly marked unpublished is preserved', async () => {
  const tmpPath = resolve(ROOT, '_test_catalogue.json');
  await fs.writeFile(tmpPath, JSON.stringify([
    { file: 'a.mp4', dept: 'makeup', caption: 'A', published: false },
    { file: 'b.mp4', dept: 'makeup', caption: 'B' },
  ]), 'utf8');
  try {
    const catalogue = new VideoCatalogue({ cataloguePath: tmpPath });
    const videos = await catalogue.load();
    assert.equal(videos[0].published, false);
    assert.equal(videos[1].published, true);
  } finally {
    await fs.unlink(tmpPath).catch(() => { });
  }
});

test('a missing catalogue file yields an empty list', async () => {
  const catalogue = new VideoCatalogue({ cataloguePath: resolve(ROOT, '_nope.json') });
  assert.deepEqual(await catalogue.load(), []);
});
