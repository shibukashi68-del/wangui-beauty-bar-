import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { OwnerVideoService } from '../lib/owner-videos.mjs';
import { VideoCatalogue } from '../lib/static.mjs';

const OWNER_ID = '123e4567-e89b-42d3-a456-426614174000';
const env = {
  SUPABASE_URL: 'https://salon.supabase.co/',
  SUPABASE_ANON_KEY: 'public-anon-key',
  SUPABASE_OWNER_USER_ID: OWNER_ID,
  SUPABASE_VIDEO_BUCKET: 'salon-videos',
  NODE_ENV: 'production',
};
const metadata = {
  title: 'Soft glam',
  caption: 'A finished look',
  category: 'Makeup',
  dept: 'makeup',
  published: true,
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function makeSessionResponse(id = OWNER_ID) {
  return jsonResponse({
    access_token: 'owner-access-token',
    refresh_token: 'owner-refresh-token',
    user: { id, email: 'owner@example.test' },
  });
}

function makePool() {
  return {
    calls: [],
    async query(sql, values) {
      this.calls.push({ sql, values });
      if (sql.includes('INSERT INTO owner_videos')) {
        return { rows: [{ id: values[0], object_path: values[2], title: values[4] }] };
      }
      if (sql.includes('SELECT object_path FROM owner_videos')) {
        return { rows: [{ object_path: `${OWNER_ID}/video.mp4` }] };
      }
      return { rows: [] };
    },
  };
}

function cookieFrom(res) {
  return res.headers['Set-Cookie'].split(';')[0];
}

async function authenticatedService({ fetchImpl = async () => jsonResponse({ id: OWNER_ID, email: 'owner@example.test' }), pool = makePool() } = {}) {
  const service = new OwnerVideoService({
    pool,
    env,
    fetchImpl: async (url, options) => {
      if (String(url).includes('/auth/v1/token?grant_type=password')) return makeSessionResponse();
      return fetchImpl(url, options);
    },
  });
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  await service.signIn({}, response, { email: 'owner@example.test', password: 'a-secret' });
  const req = { headers: { cookie: cookieFrom(response) } };
  const context = await service.authenticate(req, { setHeader() {} });
  return { service, pool, context, cookie: cookieFrom(response), response };
}

test('owner video management remains disabled until Supabase is configured', async () => {
  const service = new OwnerVideoService({ pool: makePool(), env: {}, fetchImpl: fetch });
  assert.equal(service.configured, false);
  await assert.rejects(service.list(), { status: 503 });
});

test('sign-in creates a secure HttpOnly SameSite cookie only for the configured owner', async () => {
  const service = new OwnerVideoService({
    pool: makePool(),
    env,
    fetchImpl: async () => makeSessionResponse(),
  });
  const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  const result = await service.signIn({}, res, { email: 'owner@example.test', password: 'secret' });
  assert.equal(result.signedIn, true);
  assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(res.headers['Set-Cookie'], /; Secure/);
  assert.doesNotMatch(res.headers['Set-Cookie'], /owner-access-token/);
});

test('sign-in rejects an authenticated but non-owner Supabase account', async () => {
  const service = new OwnerVideoService({
    pool: makePool(),
    env,
    fetchImpl: async () => makeSessionResponse('123e4567-e89b-42d3-a456-426614174001'),
  });
  const res = { setHeader() { assert.fail('must not set a session cookie'); } };
  await assert.rejects(
    service.signIn({}, res, { email: 'someone@example.test', password: 'secret' }),
    { status: 401 },
  );
});

test('owner upload validates the media type and file signature before storage', async () => {
  const { service, context } = await authenticatedService();
  const req = Readable.from([Buffer.from('not a video')]);
  req.headers = { 'content-type': 'text/plain' };
  await assert.rejects(service.upload(context, req, metadata), { status: 415 });
});

test('owner upload stores the file and catalogue metadata outside the app filesystem', async () => {
  const calls = [];
  const pool = makePool();
  const { service, context } = await authenticatedService({
    pool,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).endsWith('/auth/v1/user')) return jsonResponse({ id: OWNER_ID });
      return jsonResponse({ Key: 'saved' });
    },
  });
  const mp4 = Buffer.alloc(12);
  mp4.write('ftyp', 4);
  const req = Readable.from([mp4]);
  req.headers = { 'content-type': 'video/mp4' };
  const saved = await service.upload(context, req, metadata);
  assert.match(saved.object_path, /^owner\/[0-9a-f-]+\.mp4$/);
  assert.equal(calls[1].url, `https://salon.supabase.co/storage/v1/object/salon-videos/${saved.object_path}`);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer owner-access-token');
  assert.ok(pool.calls.some(({ sql }) => sql.includes('INSERT INTO owner_videos')));
});

test('owner update requires a valid identifier and removes storage before metadata', async () => {
  const calls = [];
  const pool = makePool();
  const { service, context } = await authenticatedService({
    pool,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (String(url).endsWith('/auth/v1/user')) return jsonResponse({ id: OWNER_ID });
      return jsonResponse({});
    },
  });
  await assert.rejects(service.update('not-an-id', metadata), { status: 400 });
  assert.deepEqual(await service.delete(context, '123e4567-e89b-42d3-a456-426614174002'), { deleted: true });
  assert.equal(calls[1].options.method, 'DELETE');
  assert.ok(pool.calls.at(-2).sql.includes('SET published = false'));
  assert.ok(pool.calls.at(-1).sql.includes('DELETE FROM owner_videos'));
});

test('public catalogue includes only published owner videos with their external storage URL', async () => {
  const catalogue = new VideoCatalogue({
    cataloguePath: new URL('../css/videos.json', import.meta.url),
    pool: {
      async query(sql) {
        assert.match(sql, /WHERE published = true/);
        return {
          rows: [{
            id: '123e4567-e89b-42d3-a456-426614174002',
            object_path: 'owner/123e4567-e89b-42d3-a456-426614174002.mp4',
            url: 'https://salon.supabase.co/storage/v1/object/public/salon-videos/owner/clip.mp4',
            title: 'Soft glam',
            caption: 'Finished look',
            category: 'Makeup',
            dept: 'makeup',
          }],
        };
      },
    },
  });
  const videos = await catalogue.load();
  const uploaded = videos.find((video) => video.title === 'Soft glam');
  assert.equal(uploaded.url, 'https://salon.supabase.co/storage/v1/object/public/salon-videos/owner/clip.mp4');
  assert.equal(uploaded.published, undefined);
  assert.equal(videos.length, 21);
});

test('owner video list is scoped to the configured owner and exposes the stored path', async () => {
  const pool = {
    async query(sql, values) {
      assert.match(sql, /WHERE owner_id = \$1/);
      assert.deepEqual(values, [OWNER_ID]);
      return { rows: [{ id: 'clip-id', object_path: 'owner/clip.mp4' }] };
    },
  };
  const service = new OwnerVideoService({ pool, env });
  assert.deepEqual(await service.list(), [{
    id: 'clip-id',
    object_path: 'owner/clip.mp4',
    file: 'owner/clip.mp4',
  }]);
});
