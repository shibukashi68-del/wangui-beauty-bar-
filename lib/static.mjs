// Video catalogue persistence + static file serving with strong caching.

import { createReadStream, promises as fs } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url)) === ''
  ? process.cwd()
  : dirname(dirname(fileURLToPath(import.meta.url))); // repo root (this file is in lib/)

export const VIDEO_DEPTS = ['wigs-hair', 'makeup', 'nails', 'brows-lashes'];

export class VideoCatalogue {
  constructor({ dir, cataloguePath, maxUploadBytes }) {
    this.dir = dir;
    this.cataloguePath = cataloguePath;
    this.maxUploadBytes = maxUploadBytes;
    this.maxRequestBytes = maxUploadBytes + 1024 * 1024;
    this.label = `${Math.ceil(maxUploadBytes / (1024 * 1024))} MB`;
  }

  async load() {
    let data;
    try {
      data = await fs.readFile(this.cataloguePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) throw new Error('Video catalogue must contain a JSON array.');
    return parsed;
  }

  async save(videos) {
    await fs.mkdir(dirname(this.cataloguePath), { recursive: true });
    const tempPath = `${this.cataloguePath}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(videos, null, 2), { flag: 'wx' });
      await fs.rename(tempPath, this.cataloguePath);
    } catch (error) {
      await fs.unlink(tempPath).catch(() => { });
      throw error;
    }
  }

  saveName(filename) {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
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
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
      + "font-src 'self' https://fonts.gstatic.com; media-src 'self'; img-src 'self' data:; "
      + "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  };
}

export async function serveStatic(req, res, pathname, { root }) {
  let target;
  if (pathname === '/' || pathname === '/index.html') {
    target = resolve(root, 'css/index.html');
  } else if (pathname.startsWith('/video/')) {
    const name = decodeURIComponent(pathname.slice('/video/'.length));
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
