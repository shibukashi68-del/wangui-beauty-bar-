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

/** The peer address of the request, or 'unknown' when the socket is gone. */
export function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
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
