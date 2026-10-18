// Minimal declarative router with path parameters, replacing the if/else
// cascade. Routes are matched against `METHOD /path/:param` patterns.

import { log } from './logging.mjs';

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regex = pattern.replace(/\/([a-zA-Z]+):([a-zA-Z]+)(?=\?|\/|$)/g, (_, slash, key) => {
      keys.push(key);
      return `${slash}([^/]+)`;
    });
    this.routes.push({ method, regex: new RegExp(`^${regex}$`), keys, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  head(p, h) { return this.add('HEAD', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  /**
   * Finds a matching route. Returns { handler, params } or null.
   * A path that matches a route with a different method also returns null —
   * the caller's 405 fallback answers it with the correct status.
   */
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method && !(route.method === 'GET' && method === 'HEAD')) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
      return { handler: route.handler, params };
    }
    return null;
  }
}

/**
 * Resolves a request to a route. Returns { handler, params } when a route
 * matches, or null when the caller should handle it (static files, 405, 404).
 * Dispatch never writes a response itself — that stays with the caller.
 */
export function dispatch(router, req, res, pathname) {
  const matched = router.match(req.method, pathname);
  if (!matched) return null;
  log.debug('route.matched', { method: req.method, path: pathname });
  return matched;
}
