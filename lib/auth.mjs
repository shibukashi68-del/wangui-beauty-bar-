// Admin authentication: session cookies + password gate.
//
// Single Responsibility — this module owns everything session-shaped:
// reading/validating the cookie, guarding routes, and issuing/revoking
// sessions. It depends only on the `SessionStore` and `RateLimiter` shapes
// (Dependency Inversion), so a Redis store can be swapped in without change.

import { timingSafeEqual } from 'node:crypto';
import { json } from './http.mjs';

export const SESSION_COOKIE = 'wbb_session';
const MAX_PASSWORD_BYTES = 200;
const MIN_PASSWORD_LENGTH = 12;

/** Extracts the session id from a request's Cookie header, or ''. */
function cookieSessionId(req) {
  const cookies = (req.headers.cookie || '').split(';');
  const entry = cookies.map((v) => v.trim()).find((v) => v.startsWith(`${SESSION_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1)) : '';
}

export class AdminAuthenticator {
  constructor({ sessions, password, isProduction }) {
    this.sessions = sessions;
    this.password = password;
    this.isProduction = isProduction;
    this.loginLimiter = null; // set via withLoginRateLimit()
  }

  /** Attaches the rate limiter used to throttle login attempts per client. */
  withLoginRateLimit(limiter) {
    this.loginLimiter = limiter;
    return this;
  }

  /** Resolves the request's live session id, or null when unauthenticated. */
  currentSession(req) {
    const id = cookieSessionId(req);
    return this.sessions.touch(id) ? id : null;
  }

  /** Writes a 401 unless the request carries a valid session cookie. */
  guard(req, res) {
    if (this.currentSession(req)) return true;
    json(res, 401, { error: 'Please sign in again.' });
    return false;
  }

  /** True when the configured password meets the minimum bar. */
  isPasswordUsable() {
    return this.password.length >= MIN_PASSWORD_LENGTH;
  }

  /** Constant-time password comparison, byte-length aware. */
  passwordMatches(provided) {
    const providedBytes = Buffer.from(typeof provided === 'string' ? provided : '');
    const expectedBytes = Buffer.from(this.password);
    return providedBytes.length <= MAX_PASSWORD_BYTES
      && providedBytes.length === expectedBytes.length
      && timingSafeEqual(providedBytes, expectedBytes);
  }

  /** Issues a session and answers the login response with its cookie. */
  async handleLogin(req, res, body) {
    if (!this.isPasswordUsable()) {
      return json(res, 503, {
        error: 'Set ADMIN_PASSWORD to a unique password of at least 12 characters.',
      });
    }
    const limiter = this.loginLimiter;
    if (limiter && limiter.take(body.clientIp)) {
      return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    }
    if (!this.passwordMatches(body.password)) {
      return json(res, 401, { error: 'Password was not accepted.' });
    }
    limiter?.reset(body.clientIp);
    const id = this.sessions.create();
    const secure = this.isProduction ? '; Secure' : '';
    json(res, 200, { authenticated: true }, {
      'Set-Cookie': `${SESSION_COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`,
    });
  }

  /** Revokes the current session and clears the cookie. */
  async handleLogout(req, res) {
    const id = this.currentSession(req);
    if (id) this.sessions.destroy(id);
    json(res, 200, { ok: true }, {
      'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    });
  }
}
