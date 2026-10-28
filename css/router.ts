// Hash-based router for the single-page app.
// Routes look like: #/, #/wigs-hair, #/gallery, #/booking, #/calendar

export interface RouteContext {
  /** Route path without the leading '#', e.g. '/' or '/wigs-hair'. */
  path: string;
  /** Query params parsed from the hash, e.g. #/booking?service=wig-install */
  params: URLSearchParams;
}

export type RouteRenderer = (ctx: RouteContext) => void;

interface Route {
  pattern: RegExp;
  keys: string[];
  render: RouteRenderer;
}

const routes: Route[] = [];
let outlet: HTMLElement | null = null;
let notFound: RouteRenderer | null = null;
let onNavigate: ((ctx: RouteContext) => void) | null = null;
// Hash of the last rendered route, so the async 'hashchange' event that
// follows a programmatic navigate() does not render the same view twice.
let lastRenderedHash: string | null = null;

export function registerRoute(path: string, render: RouteRenderer): void {
  // '/wigs-hair' -> /^\/wigs\-hair\/?$/
  const keys: string[] = [];
  const pattern = path.replace(/:[a-zA-Z]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  });
  routes.push({ pattern: new RegExp(`^${pattern}/?$`), keys, render });
}

export function setNotFound(render: RouteRenderer): void {
  notFound = render;
}

export function setOnNavigate(fn: (ctx: RouteContext) => void): void {
  onNavigate = fn;
}

export function mountRouter(el: HTMLElement): void {
  outlet = el;
  window.addEventListener('hashchange', () => resolve());
  resolve();
}

/** Current hash path + params, normalised so '' and '#' both become '/'. */
export function parseHash(hash: string = location.hash): RouteContext {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    params: new URLSearchParams(query),
  };
}

export function navigate(path: string, params?: Record<string, string>): void {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  const next = `#${path}${qs}`;
  if (location.hash !== next) location.hash = next;
  // Render immediately. The 'hashchange' event is asynchronous (and in some
  // environments, e.g. jsdom or embedded WebViews, may be delayed), so the
  // view must not wait for it. The guard in resolve() skips the duplicate
  // render when the event does arrive.
  resolve();
}

function resolve(): void {
  if (location.hash === lastRenderedHash) return;
  lastRenderedHash = location.hash;
  const ctx = parseHash();
  onNavigate?.(ctx);
  if (!outlet) return;

  for (const route of routes) {
    const m = ctx.path.match(route.pattern);
    if (!m) continue;
    outlet.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'auto' });
    route.render(ctx);
    return;
  }

  outlet.innerHTML = '';
  if (notFound) notFound(ctx);
}
