// Sessions and rate limiting.
//
// The previous implementation stored sessions in a Map that only expired on
// access, so memory grew unbounded if clients never logged out. This module
// sweeps expired entries on an interval (paused automatically when idle) and
// provides a swappable SessionStore interface so a Redis-backed store can
// replace the in-memory one without touching route code.

import { randomBytes } from 'node:crypto';

export class MemorySessionStore {
  constructor({ ttlMs, sweepIntervalMs = 60_000 }) {
    this.ttlMs = ttlMs;
    this.sweepIntervalMs = sweepIntervalMs;
    this.sessions = new Map();
    this.timer = null;
  }

  create() {
    const id = randomBytes(32).toString('hex');
    const session = { id, expires: Date.now() + this.ttlMs };
    this.sessions.set(id, session);
    this.ensureSweep();
    return id;
  }

  /** Returns the session object (refreshing expiry), or null when unknown/expired. */
  touch(id) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expires < Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    session.expires = Date.now() + this.ttlMs;
    return session;
  }

  destroy(id) {
    this.sessions.delete(id);
  }

  get size() { return this.sessions.size; }

  ensureSweep() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (session.expires < now) this.sessions.delete(id);
      }
      // Pause sweeping when idle — no sessions, no timer.
      if (this.sessions.size === 0) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, this.sweepIntervalMs);
    this.timer.unref?.();
  }

  async close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.sessions.clear();
  }
}

/** Fixed-window rate limiter, keyed, bounded, self-cleaning. */
export class RateLimiter {
  constructor({ max, windowMs, maxKeys = 5000 }) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  get size() { return this.hits.size; }

  take(key) {
    const now = Date.now();
    if (this.hits.size >= this.maxKeys) {
      for (const [k, record] of this.hits) if (record.until <= now) this.hits.delete(k);
      // Still over capacity with only live keys — drop the oldest.
      if (this.hits.size >= this.maxKeys) {
        const oldest = this.hits.keys().next().value;
        this.hits.delete(oldest);
      }
    }
    let record = this.hits.get(key);
    if (!record || record.until <= now) record = { count: 0, until: now + this.windowMs };
    record.count += 1;
    this.hits.set(key, record);
    return record.count > this.max;
  }

  reset(key) {
    this.hits.delete(key);
  }
}
