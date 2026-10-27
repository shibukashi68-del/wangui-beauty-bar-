import { CONFIG } from './config.js';

const WHATSAPP_URL = CONFIG.whatsappNumber
  ? `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(
    `Hello ${CONFIG.salonName}, I would like to enquire about booking a beauty service. Please confirm availability.`,
  )}`
  : '#/contact';

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
      <nav class="nav" id="primary-nav" aria-label="Primary">
        <a href="#/" ${active === '/' ? 'aria-current="page"' : ''}>Home</a>
        <details class="nav__services">
          <summary>Services</summary>
          <div class="nav__menu">
            <a href="#/dept/wigs-hair">Wigs &amp; Hair</a>
            <a href="#/dept/makeup">Makeup</a>
            <a href="#/dept/nails">Nails</a>
            <a href="#/dept/brows-lashes">Brows &amp; Lashes</a>
            <a href="#/other-services">Other Beauty Services</a>
            <a href="#/occasions">Bridal &amp; Special Occasions</a>
          </div>
        </details>
        <a href="#/gallery" ${active === '/gallery' ? 'aria-current="page"' : ''}>Video Gallery</a>
        <a href="#/contact" ${active === '/contact' ? 'aria-current="page"' : ''}>Contact</a>
        <a class="nav__cta" href="${WHATSAPP_URL}" ${CONFIG.whatsappNumber ? 'target="_blank" rel="noopener noreferrer"' : ''}>Book via WhatsApp</a>
      </nav>
      <button class="nav-toggle" type="button" aria-controls="primary-nav" aria-expanded="false">Menu</button>
    </div>`;

  const toggle = header.querySelector('.nav-toggle') as HTMLButtonElement | null;
  const nav = header.querySelector('.nav') as HTMLElement | null;

  const closeNav = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    header.classList.remove('is-nav-open');
  };

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    header.classList.toggle('is-nav-open', !open);
  });

  nav?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) closeNav();
  });

  root.prepend(header);
}
