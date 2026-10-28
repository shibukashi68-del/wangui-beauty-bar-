// HTTP request/response helpers shared by routes and error handling.
//
// Body readers throw typed `HttpError`s (lib/errors.mjs) so the central error
// handler can map them onto HTTP statuses without per-route try/catch.

import { badRequest, tooLarge } from './errors.mjs';

export function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

// The peer address of the request, or 'unknown' when the socket is gone.
//
// Behind a reverse proxy (Cloudflare Pages -> Render) every request arrives
// from the proxy's address, so keying on the socket alone would put all
// customers in one rate-limit bucket. `X-Forwarded-For` is therefore honoured
// ONLY when the immediate peer is itself a trusted proxy, configured through
// TRUSTED_PROXIES. A client connecting directly can spoof the header, but a
// direct client's socket address is not trusted, so the header is ignored.
function trustedProxies() {
  return new Set(
    String(process.env.TRUSTED_PROXIES || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

/** Normalize IPv4-mapped IPv6 (::ffff:1.2.3.4) so keys compare consistently. */
function normalizeAddress(address) {
  return String(address || '').replace(/^::ffff:/i, '');
}

export function clientIp(req) {
  const peer = normalizeAddress(req.socket?.remoteAddress);
  if (!peer || !trustedProxies().has(peer)) return peer || 'unknown';

  // Left-most entry is the original client; the proxy appends, not prepends.
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((entry) => normalizeAddress(entry.trim()))
    .filter(Boolean);

  return forwarded[0] || peer;
}

const DEFAULT_JSON_BODY_LIMIT = 16_384;

/**
 * Buffers and parses a JSON request body. Rejects oversized payloads (413)
 * and malformed JSON (400) with typed errors.
 */
export async function readJsonBody(req, limit = DEFAULT_JSON_BODY_LIMIT) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > limit) throw tooLarge('Request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw badRequest('Invalid JSON request.');
  }
}
