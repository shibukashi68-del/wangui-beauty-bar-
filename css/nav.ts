import { CONFIG } from './config.js';

// Nav links. Each entry: [label, hash route]. The route path is also what
// app.ts matches against to mark the active link.
const LINKS: Array<[string, string]> = [
  ['Home','#/'],
  ['Wigs & Hair','#/dept/wigs-hair'],
  ['Makeup','#/dept/makeup'],
  ['Nails','#/dept/nails'],
  ['Brows & Lashes','#/dept/brows-lashes'],
  ['Gallery','#/gallery'],
  ['Book','#/booking'],
  ['Manage Videos','#/admin/videos'],
];

export interface MountNavOptions {
  base?: string;
  /** Current route path, e.g. '/' or '/dept/makeup'. */
  active?: string;
}

export function mountNav(root: HTMLElement, { base = '', active = '' }: MountNavOptions = {}): void {
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container site-header__inner">
      <a class="brand" href="#/">
        <span>${CONFIG.salonName}</span>
      </a>
      <nav class="nav" aria-label="Primary">
        ${LINKS.map(([label, href]) =>
          `<a href="${href}" ${href.replace(/^#/, '') === active ? 'aria-current="page"' : ''}>${label}</a>`
        ).join('')}
      </nav>
      <button class="nav-toggle" aria-expanded="false">Menu</button>
    </div>`;

  const toggle = header.querySelector('.nav-toggle') as HTMLButtonElement | null;
  const nav = header.querySelector('.nav') as HTMLElement | null;

  const closeNav = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    if (nav) nav.style.display = '';
  };

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    if (nav) {
      nav.style.display = open ? '' : 'flex';
      nav.style.flexDirection = 'column';
      nav.style.position = 'absolute';
      nav.style.top = '72px';
      nav.style.left = '0';
      nav.style.right = '0';
      nav.style.background = 'var(--color-bg)';
      nav.style.padding = 'var(--sp-5)';
    }
  });

  // In a single-page app the document never reloads, so close the mobile
  // menu whenever a nav link is followed.
  nav?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) closeNav();
  });

  root.prepend(header);
}
