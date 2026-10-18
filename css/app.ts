// Main application entry point.
// Single-page app: mounts the shared nav/footer once, then lets the
// hash router swap views into the #view outlet.

import { mountNav } from './nav.js';
import { mountFooter } from './footer.js';
import { mountRouter, registerRoute, setNotFound, setOnNavigate, parseHash } from './router.js';
import { registerRoutes, renderNotFound } from './views.js';

export function initApp(): void {
  const app = document.getElementById('app');
  const view = document.getElementById('view');
  if (!app || !view) return;

  // Register all view routes against the shared router.
  registerRoutes(registerRoute);

  setNotFound(() => renderNotFound(view));

  // Keep the active nav link in sync with the current route.
  setOnNavigate((ctx) => {
    document.querySelectorAll('.site-header .nav a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      // Links are real route paths ('#/', '#/dept/makeup'), so compare directly.
      const routePath = href.replace(/^#/, '');
      if (routePath && routePath === ctx.path) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });
  });

  // Mount shared chrome (header/footer) once, around the outlet.
  // 'active' is matched against each link's real route path in nav.ts.
  mountNav(app, { active: parseHash().path });
  mountFooter(app);

  mountRouter(view);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => initApp());
}