import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

const backendOrigin = 'https://wangui-beauty-bar.onrender.com';

test('Pages API proxy reports a missing backend configuration', async () => {
  const response = await onRequest({
    request: new Request('https://beauty.pages.dev/api/health'),
    env: {},
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'API backend is not configured.' });
});

test('Pages API proxy rejects cross-origin mutations', async () => {
  const response = await onRequest({
    request: new Request('https://beauty.pages.dev/api/admin/session', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: '{}',
    }),
    env: { BACKEND_ORIGIN: backendOrigin },
  });

  assert.equal(response.status, 403);
});

test('Pages API proxy forwards API requests and backend cookies', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (request) => {
    assert.equal(request.url, `${backendOrigin}/api/admin/session?check=1`);
    assert.equal(request.headers.get('origin'), backendOrigin);
    assert.equal(request.headers.get('cookie'), 'owner_session=example');
    assert.equal(await request.text(), '{"email":"owner@example.com"}');
    return new Response('{"signedIn":true}', {
      headers: { 'Set-Cookie': 'owner_session=example; Path=/; HttpOnly; SameSite=Strict; Secure' },
    });
  };

  const response = await onRequest({
    request: new Request('https://beauty.pages.dev/api/admin/session?check=1', {
      method: 'POST',
      headers: {
        Origin: 'https://beauty.pages.dev',
        Cookie: 'owner_session=example',
        'Content-Type': 'application/json',
      },
      body: '{"email":"owner@example.com"}',
    }),
    env: { BACKEND_ORIGIN: backendOrigin },
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.deepEqual(await response.json(), { signedIn: true });
});

test('Pages API proxy rejects a backend URL with a path', async () => {
  const response = await onRequest({
    request: new Request('https://beauty.pages.dev/api/health'),
    env: { BACKEND_ORIGIN: `${backendOrigin}/unexpected` },
  });

  assert.equal(response.status, 500);
});
