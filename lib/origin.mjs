// Cross-site request protection for state-changing owner endpoints.
//
// Two independent layers, both required:
//   1. `Sec-Fetch-Site: cross-site` is refused outright. Browsers set this
//      themselves and it cannot be spoofed from page JavaScript.
//   2. A present `Origin` header must be on the allowlist.
//
// The allowlist deliberately does NOT compare against `req.headers.host`.
// When the frontend is served from Cloudflare Pages and /api/* is proxied to
// the Node backend, the forwarded Origin is the Pages domain while Host is the
// backend domain — comparing the two rejected every owner mutation with a 403.
// Accepted origins are configured explicitly via SITE_URL instead.

/**
 * Parse the comma-separated SITE_URL allowlist into normalized origins.
 * Invalid entries are ignored rather than failing startup; an empty list just
 * means "only the request's own host is trusted".
 *
 * @param {string} [value] raw SITE_URL, e.g. "https://salon.pages.dev,https://salon.co.ke"
 * @returns {Set<string>} normalized `protocol//host` origins
 */
export function parseAllowedOrigins(value) {
  const origins = new Set();
  for (const entry of String(value || '').split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        origins.add(`${url.protocol}//${url.host.toLowerCase()}`);
      }
    } catch {
      // Ignore malformed entries; they are logged by the caller at startup.
    }
  }
  return origins;
}

/**
 * Throws a 403 HttpError-shaped error when the request is not same-site.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {Set<string>} allowedOrigins extra origins trusted beyond the request's own host
 */
export function assertSameOrigin(req, allowedOrigins = new Set()) {
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site') {
    throw Object.assign(new Error('Cross-site requests are not allowed.'), { status: 403 });
  }

  const origin = req.headers.origin;
  // Non-browser clients (curl, health checks) send no Origin. Sec-Fetch-Site
  // already covers the browser CSRF case, and the session cookie is
  // SameSite=Strict, so an absent Origin is not a bypass.
  if (!origin) return;

  let originKey;
  try {
    const url = new URL(origin);
    originKey = `${url.protocol}//${url.host.toLowerCase()}`;
  } catch {
    throw Object.assign(new Error('Invalid request origin.'), { status: 403 });
  }

  // The request's own host is always trusted (direct access to the backend,
  // and local development).
  const host = String(req.headers.host || '').toLowerCase();
  const ownOrigins = host ? new Set([`https://${host}`, `http://${host}`]) : new Set();

  if (allowedOrigins.has(originKey) || ownOrigins.has(originKey)) return;

  throw Object.assign(new Error('Cross-origin requests are not allowed.'), { status: 403 });
}
