// Tests for proxy-aware client identification used by the rate limiters.
// Run: node --test test/client-ip.test.mjs
//
// Each scenario re-imports the module with a fresh query string so the module
// cache cannot hide configuration-loading regressions. TRUSTED_PROXIES itself
// is intentionally read when clientIp() runs, after the server loads .env.

import test from 'node:test';
import assert from 'node:assert/strict';

async function loadClientIp(trustedProxies) {
  if (trustedProxies === undefined) delete process.env.TRUSTED_PROXIES;
  else process.env.TRUSTED_PROXIES = trustedProxies;
  const module = await import(`../lib/http.mjs?proxies=${encodeURIComponent(trustedProxies ?? '')}`);
  return module.clientIp;
}

function req({ remote, forwarded } = {}) {
  return {
    socket: { remoteAddress: remote },
    headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
  };
}

test('uses the socket address when no proxies are trusted', async () => {
  const clientIp = await loadClientIp('');
  assert.equal(clientIp(req({ remote: '203.0.113.9', forwarded: '198.51.100.1' })), '203.0.113.9');
});

test('ignores a spoofed X-Forwarded-For from an untrusted peer', async () => {
  const clientIp = await loadClientIp('10.0.0.1');
  assert.equal(clientIp(req({ remote: '203.0.113.9', forwarded: '1.2.3.4' })), '203.0.113.9');
});

test('trusts X-Forwarded-For when the peer is a configured proxy', async () => {
  const clientIp = await loadClientIp('10.0.0.1');
  assert.equal(clientIp(req({ remote: '10.0.0.1', forwarded: '198.51.100.7' })), '198.51.100.7');
});

test('takes the left-most forwarded entry as the original client', async () => {
  const clientIp = await loadClientIp('10.0.0.1');
  assert.equal(
    clientIp(req({ remote: '10.0.0.1', forwarded: '198.51.100.7, 10.0.0.5, 10.0.0.1' })),
    '198.51.100.7',
  );
});

test('falls back to the proxy address when the header is empty', async () => {
  const clientIp = await loadClientIp('10.0.0.1');
  assert.equal(clientIp(req({ remote: '10.0.0.1', forwarded: '' })), '10.0.0.1');
});

test('normalizes IPv4-mapped IPv6 addresses so keys match', async () => {
  const clientIp = await loadClientIp('');
  assert.equal(clientIp(req({ remote: '::ffff:203.0.113.9' })), '203.0.113.9');
});

test('matches an IPv4-mapped proxy peer against the trusted list', async () => {
  const clientIp = await loadClientIp('10.0.0.1');
  assert.equal(clientIp(req({ remote: '::ffff:10.0.0.1', forwarded: '198.51.100.7' })), '198.51.100.7');
});

test('reports unknown when the socket is gone', async () => {
  const clientIp = await loadClientIp('');
  assert.equal(clientIp(req({})), 'unknown');
});

test('trims whitespace and ignores empty entries in the proxy list', async () => {
  const clientIp = await loadClientIp(' 10.0.0.1 , , 10.0.0.2 ');
  assert.equal(clientIp(req({ remote: '10.0.0.2', forwarded: '198.51.100.7' })), '198.51.100.7');
});

test('reads trusted proxy configuration when identifying the client', async () => {
  const previous = process.env.TRUSTED_PROXIES;
  try {
    const clientIp = await loadClientIp('');
    process.env.TRUSTED_PROXIES = '10.0.0.1';
    assert.equal(clientIp(req({ remote: '10.0.0.1', forwarded: '198.51.100.7' })), '198.51.100.7');
  } finally {
    if (previous === undefined) delete process.env.TRUSTED_PROXIES;
    else process.env.TRUSTED_PROXIES = previous;
  }
});
