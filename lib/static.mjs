// Video catalogue persistence + static file serving with strong caching.

import { createReadStream, promises as fs } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)) === ''
  ? process.cwd()
  : dirname(dirname(fileURLToPath(import.meta.url))); // repo root (this file is in lib/)

export class VideoCatalogue {
  constructor({ cataloguePath, pool = null }) {
    this.cataloguePath = cataloguePath;
    this.pool = pool;
  }

  async load() {
    let data;
    try {
      data = await fs.readFile(this.cataloguePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parsed = data ? JSON.parse(data) : [];
    if (!Array.isArray(parsed)) throw new Error('Video catalogue must contain a JSON array.');

    // Normalize bundled entries to the same shape the owner table produces, so
    // the client never has to treat a missing `published` as "visible".
    const bundled = parsed.map((video) => ({
      ...video,
      published: video.published !== false,
      priceKes: video.priceKes ?? null,
      reviewRequired: video.reviewRequired ?? false,
    }));

    if (!this.pool) return bundled;

    const { rows } = await this.pool.query(`
      SELECT id, object_path, url, title, caption, category, dept
      FROM owner_videos
      WHERE published = true
      ORDER BY created_at DESC
    `);
    return [
      ...bundled,
      ...rows.map((video) => ({
        id: video.id,
        file: video.object_path,
        url: video.url,
        title: video.title,
        caption: video.caption || video.title,
        category: video.category,
        dept: video.dept,
        published: true,
        priceKes: null,
        reviewRequired: false,
      })),
    ];
  }

}

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.mp4': 'video/mp4',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// Immutable hashed assets get a long cache; HTML/entry points get revalidation.
const IMMUTABLE = /\/[a-z0-9]+\.[a-z0-9]{8}\.(?:js|css)$/i;

export function securityHeaders() {
  let supabaseOrigin = '';
  try {
    const url = new URL(process.env.SUPABASE_URL);
    if (url.protocol === 'https:' || url.hostname === 'localhost') supabaseOrigin = url.origin;
  } catch {
    // Supabase video assets are optional for local and unconfigured installs.
  }
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `media-src 'self' ${supabaseOrigin}`.trim(),
      "img-src 'self' data:",
      `connect-src 'self' ${supabaseOrigin}`.trim(),
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  };
}

export async function serveStatic(req, res, pathname, { root }) {
  let target;
  if (pathname === '/' || pathname === '/index.html') {
    target = resolve(root, 'css/index.html');
  } else if (pathname.startsWith('/video/')) {
    let name;
    try {
      name = decodeURIComponent(pathname.slice('/video/'.length));
    } catch {
      // Malformed percent-encoding (e.g. /video/%ZZ) is a client error, not a
      // server error — decodeURIComponent throws URIError on it.
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'Malformed URL.' }));
    }
    target = resolve(root, 'video', name);
    if (!target.startsWith(`${resolve(root, 'video')}${sep}`)) return notFound(res);
  } else if (/^\/[a-z0-9-]+\.(?:js|css|svg|json|webmanifest|ico|png|jpg|jpeg|webp|woff2)$/.test(pathname)) {
    target = resolve(root, 'css', pathname.slice(1));
  } else {
    return notFound(res);
  }

  let stat;
  try { stat = await fs.stat(target); }
  catch { return notFound(res, 'File not found.'); }
  if (!stat.isFile()) return notFound(res, 'File not found.');

  const headers = {
    'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
    ...securityHeaders(),
    // Hashed build outputs are content-addressed; everything else revalidates.
    'Cache-Control': IMMUTABLE.test(pathname)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  };

  const range = req.headers.range;
  const rangeMatch = range && range.match(/^bytes=(\d*)-(\d*)$/);
  if (rangeMatch) {
    const start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, stat.size - Number(rangeMatch[2]));
    const end = rangeMatch[2] && rangeMatch[1] ? Math.min(Number(rangeMatch[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    return req.method === 'HEAD' ? res.end() : createReadStream(target, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size });
  return req.method === 'HEAD' ? res.end() : createReadStream(target).pipe(res);
}

function notFound(res, message = 'Not found.') {
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}
