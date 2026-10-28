// Unit tests for cross-site request protection on owner mutations.
// Run: node --test test/origin.test.mjs
//
// Regression cover for the Cloudflare Pages proxy case: the forwarded Origin is
// the Pages domain while Host is the backend domain. Comparing the two rejected
// every owner sign-in/upload/edit/delete with a 403.

import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSameOrigin, parseAllowedOrigins } from '../lib/origin.mjs';

const BACKEND_HOST = 'wangui-beauty-bar.onrender.com';

function request(headers) {
  return { headers: { host: BACKEND_HOST, ...headers } };
}

test('parseAllowedOrigins splits, normalizes and lowercases entries', () => {
  const origins = parseAllowedOrigins('https://Salon.Pages.dev, http://localhost:3000/ ,');
  assert.deepEqual([...origins], ['https://salon.pages.dev', 'http://localhost:3000']);
});

test('parseAllowedOrigins ignores malformed and non-http entries', () => {
  const origins = parseAllowedOrigins('not-a-url, ftp://example.com, , https://ok.example');
  assert.deepEqual([...origins], ['https://ok.example']);
});

test('parseAllowedOrigins returns an empty set for missing input', () => {
  assert.equal(parseAllowedOrigins(undefined).size, 0);
  assert.equal(parseAllowedOrigins('').size, 0);
});

test('requests without an Origin header are allowed', () => {
  assert.doesNotThrow(() => assertSameOrigin(request({})));
});

test('the backend host is always trusted', () => {
  assert.doesNotThrow(() => assertSameOrigin(request({ origin: `https://${BACKEND_HOST}` })));
  assert.doesNotThrow(() => assertSameOrigin(request({ origin: `http://${BACKEND_HOST}` })));
});

test('a configured SITE_URL origin is allowed through the Pages proxy', () => {
  const allowed = parseAllowedOrigins('https://beauty.pages.dev');
  // This is the exact case that used to fail: Origin is Pages, Host is Render.
  assert.doesNotThrow(() => assertSameOrigin(
    request({ origin: 'https://beauty.pages.dev' }),
    allowed,
  ));
});

test('the Pages origin is rejected when it is not configured', () => {
  assert.throws(
    () => assertSameOrigin(request({ origin: 'https://beauty.pages.dev' }), new Set()),
    (error) => error.status === 403 && /Cross-origin/.test(error.message),
  );
});

test('an unrelated origin is rejected even when an allowlist exists', () => {
  const allowed = parseAllowedOrigins('https://beauty.pages.dev');
  assert.throws(
    () => assertSameOrigin(request({ origin: 'https://evil.example' }), allowed),
    (error) => error.status === 403,
  );
});

test('Sec-Fetch-Site: cross-site is refused regardless of Origin', () => {
  const allowed = parseAllowedOrigins('https://beauty.pages.dev');
  assert.throws(
    () => assertSameOrigin(
      request({ origin: 'https://beauty.pages.dev', 'sec-fetch-site': 'cross-site' }),
      allowed,
    ),
    (error) => error.status === 403 && /Cross-site/.test(error.message),
  );
});

test('a malformed Origin is rejected', () => {
  assert.throws(
    () => assertSameOrigin(request({ origin: 'not a url' })),
    (error) => error.status === 403 && /Invalid request origin/.test(error.message),
  );
});

test('origin matching ignores the port when comparing against the allowlist exactly', () => {
  const allowed = parseAllowedOrigins('https://beauty.pages.dev');
  assert.throws(
    () => assertSameOrigin(request({ origin: 'https://beauty.pages.dev:8443' }), allowed),
    (error) => error.status === 403,
  );
});

// ─── Live HTTP route test ────────────────────────────────────────────
// Exercises the real server.mjs request pipeline (not just the helper) so a
// future refactor cannot re-break the proxy case without failing a test.
// The server needs a reachable database, so this runs only when the test
// database is configured and is skipped otherwise.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HAS_DATABASE = Boolean(process.env.DATABASE_URL || process.env.PGPASSWORD);
const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function startServer(env) {
  const port = 3900 + Math.floor(Math.random() * 90);
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, ...env, PORT: String(port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((accept) => setTimeout(accept, 250));
    if (child.exitCode !== null) throw new Error(`server exited early: ${log}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/admin/config`);
      if (res.ok) return { child, port };
    } catch { /* not listening yet */ }
  }
  child.kill();
  throw new Error(`server did not become ready: ${log}`);
}

test('live server allows the configured Pages origin on an owner mutation',
  { skip: HAS_DATABASE ? false : 'needs a test database (DATABASE_URL or PGPASSWORD)' },
  async () => {
    const { child, port } = await startServer({ SITE_URL: 'https://beauty.pages.dev' });
    try {
      const url = `http://127.0.0.1:${port}/api/admin/session`;
      // DELETE /api/admin/session runs assertSameOrigin first; with an allowed
      // Origin it must get past the guard and reach the handler (200), not 403.
      const allowed = await fetch(url, { method: 'DELETE', headers: { Origin: 'https://beauty.pages.dev' } });
      assert.notEqual(allowed.status, 403, 'configured SITE_URL origin must not be rejected');

      const attacker = await fetch(url, { method: 'DELETE', headers: { Origin: 'https://evil.example' } });
      assert.equal(attacker.status, 403);

      const crossSite = await fetch(url, {
        method: 'DELETE',
        headers: { Origin: 'https://beauty.pages.dev', 'Sec-Fetch-Site': 'cross-site' },
      });
      assert.equal(crossSite.status, 403);
    } finally {
      child.kill();
    }
  });
