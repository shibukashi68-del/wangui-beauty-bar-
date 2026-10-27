import { randomUUID } from 'node:crypto';
import { log } from './logging.mjs';

const COOKIE_NAME = 'wbb_owner';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const VIDEO_TYPES = new Map([
  ['video/mp4', { extension: 'mp4', signature: (data) => data.toString('ascii', 4, 8) === 'ftyp' }],
  ['video/webm', { extension: 'webm', signature: (data) => data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) }],
]);
const DEPARTMENTS = new Set(['wigs-hair', 'makeup', 'nails', 'brows-lashes']);
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readCookie(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  try {
    const value = JSON.parse(Buffer.from(entry.slice(COOKIE_NAME.length + 1), 'base64url').toString('utf8'));
    if (typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}

function cookieOptions(isProduction) {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${isProduction ? '; Secure' : ''}`;
}

function setSessionCookie(res, session, isProduction) {
  const value = Buffer.from(JSON.stringify({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  })).toString('base64url');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${value}; ${cookieOptions(isProduction)}`);
}

function clearSessionCookie(res, isProduction) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? '; Secure' : ''}`);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function cleanText(value, label, maximum, optional = false) {
  if (typeof value !== 'string') {
    if (optional && (value === undefined || value === null)) return '';
    throw httpError(400, `${label} is required.`);
  }
  const clean = value.trim();
  if ((!optional && !clean) || clean.length > maximum) {
    throw httpError(400, `${label} must be ${optional ? 'no more than' : 'between 1 and'} ${maximum} characters.`);
  }
  return clean;
}

function parseVideoDetails(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw httpError(400, 'Enter valid video details.');
  }
  const title = cleanText(input.title, 'Title', 100);
  const caption = cleanText(input.caption, 'Caption', 300, true);
  const category = cleanText(input.category, 'Category', 80);
  const dept = input.dept;
  if (!DEPARTMENTS.has(dept)) throw httpError(400, 'Choose a valid department.');
  if (typeof input.published !== 'boolean') throw httpError(400, 'Published must be true or false.');
  return { title, caption, category, dept, published: input.published };
}

async function readLimitedBody(req, limit = MAX_VIDEO_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, 'Video exceeds the 50 MB upload limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export class OwnerVideoService {
  constructor({ pool, env = process.env, fetchImpl = fetch }) {
    this.pool = pool;
    this.fetch = fetchImpl;
    this.url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    this.anonKey = env.SUPABASE_ANON_KEY || '';
    this.ownerId = env.SUPABASE_OWNER_USER_ID || '';
    this.bucket = env.SUPABASE_VIDEO_BUCKET || 'salon-videos';
    this.isProduction = env.NODE_ENV === 'production';
  }

  get configured() {
    return Boolean(
      this.url
      && this.anonKey
      && UUID_PATTERN.test(this.ownerId)
      && /^[a-z0-9][a-z0-9._-]{1,62}$/.test(this.bucket),
    );
  }

  requireConfigured() {
    if (!this.configured) {
      throw httpError(503, 'Owner video management is not configured. Contact the site administrator.');
    }
  }

  async request(path, options = {}) {
    let response;
    try {
      response = await this.fetch(`${this.url}${path}`, options);
    } catch {
      throw httpError(502, 'The authentication or video-storage service could not be reached.');
    }
    return response;
  }

  async userForToken(accessToken) {
    const response = await this.request('/auth/v1/user', {
      headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw httpError(502, 'Could not verify owner sign-in.');
    const user = await response.json();
    return user.id === this.ownerId ? user : null;
  }

  async signIn(req, res, credentials) {
    this.requireConfigured();
    const email = cleanText(credentials.email, 'Email', 254);
    if (typeof credentials.password !== 'string' || !credentials.password) {
      throw httpError(400, 'Enter your password.');
    }
    const response = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: this.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: credentials.password }),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw httpError(401, 'Owner sign-in failed. Check the email and password.');
    }
    if (!response.ok) throw httpError(502, 'The authentication service is temporarily unavailable.');
    const session = await response.json();
    if (!session.user || typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
      throw httpError(502, 'The authentication service returned an invalid session.');
    }
    if (session.user.id !== this.ownerId) {
      throw httpError(401, 'Owner sign-in failed. Check the email and password.');
    }
    setSessionCookie(res, session, this.isProduction);
    return { signedIn: true, email: session.user.email };
  }

  async signOut(req, res) {
    const session = readCookie(req);
    if (session && this.configured) {
      try {
        await this.request('/auth/v1/logout', {
          method: 'POST',
          headers: {
            apikey: this.anonKey,
            Authorization: `Bearer ${session.accessToken}`,
          },
        });
      } finally {
        clearSessionCookie(res, this.isProduction);
      }
      return { signedIn: false };
    }
    clearSessionCookie(res, this.isProduction);
    return { signedIn: false };
  }

  async authenticate(req, res) {
    this.requireConfigured();
    const session = readCookie(req);
    if (!session) throw httpError(401, 'Sign in to manage gallery videos.');

    let user = await this.userForToken(session.accessToken);
    if (!user) {
      const response = await this.request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: this.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          clearSessionCookie(res, this.isProduction);
          throw httpError(401, 'Your sign-in expired. Sign in again.');
        }
        throw httpError(502, 'The authentication service is temporarily unavailable.');
      }
      const refreshed = await response.json();
      if (!refreshed.user || typeof refreshed.access_token !== 'string' || typeof refreshed.refresh_token !== 'string') {
        clearSessionCookie(res, this.isProduction);
        throw httpError(502, 'The authentication service returned an invalid session.');
      }
      if (refreshed.user.id !== this.ownerId) {
        clearSessionCookie(res, this.isProduction);
        throw httpError(403, 'This account is not authorized to manage the gallery.');
      }
      user = refreshed.user;
      setSessionCookie(res, refreshed, this.isProduction);
      session.accessToken = refreshed.access_token;
    }
    return { user, accessToken: session.accessToken };
  }

  async list() {
    this.requireConfigured();
    const { rows } = await this.pool.query(`
      SELECT id, object_path, title, caption, category, dept, published, created_at, updated_at
      FROM owner_videos
      WHERE owner_id = $1
      ORDER BY created_at DESC
    `, [this.ownerId]);
    return rows.map((video) => ({ ...video, file: video.object_path }));
  }

  async upload(context, req, metadata) {
    this.requireConfigured();
    const details = parseVideoDetails(metadata);
    const type = VIDEO_TYPES.get(String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase());
    if (!type) throw httpError(415, 'Upload an MP4 or WebM video.');

    const body = await readLimitedBody(req);
    if (!body.length) throw httpError(400, 'Choose a video to upload.');
    if (!type.signature(body)) throw httpError(415, 'The uploaded file does not match its video format.');

    const id = randomUUID();
    const objectPath = `owner/${id}.${type.extension}`;
    const storageResponse = await this.request(
      `/storage/v1/object/${encodeURIComponent(this.bucket)}/${objectPath}`,
      {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${context.accessToken}`,
          'Content-Type': type.extension === 'mp4' ? 'video/mp4' : 'video/webm',
          'x-upsert': 'false',
        },
        body,
      },
    );
    if (!storageResponse.ok) throw httpError(502, 'Video upload failed. Check the Supabase bucket and its owner upload policy.');

    const url = `${this.url}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${objectPath}`;
    try {
      const { rows } = await this.pool.query(`
        INSERT INTO owner_videos (id, owner_id, object_path, url, title, caption, category, dept, published)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, object_path, url, title, caption, category, dept, published, created_at, updated_at
      `, [id, this.ownerId, objectPath, url, details.title, details.caption, details.category, details.dept, details.published]);
      return rows[0];
    } catch (error) {
      try {
        await this.deleteStorageObject(context.accessToken, objectPath);
      } catch (cleanupError) {
        log.error('owner.video_upload_cleanup_failed', {
          object_path: objectPath,
          error: cleanupError?.message || String(cleanupError),
        });
      }
      throw error;
    }
  }

  async update(id, input) {
    this.requireConfigured();
    if (!UUID_PATTERN.test(id)) throw httpError(400, 'Invalid video identifier.');
    const details = parseVideoDetails(input);
    const { rows } = await this.pool.query(`
      UPDATE owner_videos
      SET title = $2, caption = $3, category = $4, dept = $5, published = $6, updated_at = now()
      WHERE id = $1 AND owner_id = $7
      RETURNING id, object_path, url, title, caption, category, dept, published, created_at, updated_at
    `, [id, details.title, details.caption, details.category, details.dept, details.published, this.ownerId]);
    if (!rows.length) throw httpError(404, 'Video was not found.');
    return rows[0];
  }

  async deleteStorageObject(accessToken, objectPath) {
    const response = await this.request(
      `/storage/v1/object/${encodeURIComponent(this.bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
      {
      method: 'DELETE',
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      },
    );
    if (!response.ok && response.status !== 404) {
      throw httpError(502, 'Could not delete the video from Supabase Storage.');
    }
  }

  async delete(context, id) {
    this.requireConfigured();
    if (!UUID_PATTERN.test(id)) throw httpError(400, 'Invalid video identifier.');
    const { rows } = await this.pool.query(
      'SELECT object_path FROM owner_videos WHERE id = $1 AND owner_id = $2',
      [id, this.ownerId],
    );
    if (!rows.length) throw httpError(404, 'Video was not found.');

    await this.pool.query(
      'UPDATE owner_videos SET published = false, updated_at = now() WHERE id = $1 AND owner_id = $2',
      [id, this.ownerId],
    );
    await this.deleteStorageObject(context.accessToken, rows[0].object_path);
    await this.pool.query('DELETE FROM owner_videos WHERE id = $1 AND owner_id = $2', [id, this.ownerId]);
    return { deleted: true };
  }
}
