import { CONFIG } from './config.js';

export interface MountFooterOptions {
  base?: string;
}

export function mountFooter(root: HTMLElement, { base = '' }: MountFooterOptions = {}): void {
  const f = document.createElement('footer');
  f.className = 'site-footer';
  const wa = CONFIG.whatsappNumber
    ? `<a href="https://wa.me/${CONFIG.whatsappNumber}" target="_blank" rel="noopener">WhatsApp</a>`
    : '';
  const insta = CONFIG.instagram
    ? `<a href="https://instagram.com/${CONFIG.instagram.replace(/^@/, '')}" target="_blank" rel="noopener">Instagram</a>`
    : '';

  f.innerHTML = `
    <div class="container site-footer__grid">
      <div>
        <div class="brand" style="font-size:var(--fs-base)">
          <span>${CONFIG.salonName}</span>
        </div>
        ${CONFIG.tagline ? `<p style="margin-top:var(--sp-3)">${CONFIG.tagline}</p>` : ''}
      </div>
      <div>
        <div class="eyebrow">Visit</div>
        <p style="margin-top:var(--sp-2)">${CONFIG.address || '—'}</p>
      </div>
      <div>
        <div class="eyebrow">Contact</div>
        <p style="margin-top:var(--sp-2)">${CONFIG.phoneDisplay || '—'}</p>
        ${wa ? `<p style="margin-top:var(--sp-1)">${wa}</p>` : ''}
        ${insta ? `<p style="margin-top:var(--sp-1)">${insta}</p>` : ''}
        ${CONFIG.email ? `<p style="margin-top:var(--sp-1)"><a href="mailto:${CONFIG.email}">${CONFIG.email}</a></p>` : ''}
      </div>
      <div>
        <div class="eyebrow">Hours</div>
        <p style="margin-top:var(--sp-2)">${CONFIG.businessHours.length
          ? CONFIG.businessHours.map(h => `${h.day}: ${h.hours}`).join('<br>')
          : '—'}</p>
      </div>
      <div>
        <div class="eyebrow">Studio</div>
        <p style="margin-top:var(--sp-2)"><a href="#/booking">Book a session</a></p>
        <p style="margin-top:var(--sp-1)"><a href="#/admin">Staff sign in</a></p>
      </div>
    </div>
    <div class="container" style="margin-top:var(--sp-6);text-align:center;color:var(--color-muted);font-size:var(--fs-xs)">
      © ${new Date().getFullYear()} ${CONFIG.salonName}
    </div>`;

  root.append(f);

  if (CONFIG.whatsappNumber && !document.querySelector('.floating-whatsapp')) {
    const waFloat = document.createElement('a');
    waFloat.className = 'floating-whatsapp';
    waFloat.href = `https://wa.me/${CONFIG.whatsappNumber}`;
    waFloat.target = '_blank';
    waFloat.rel = 'noopener';
    waFloat.setAttribute('aria-label', 'Chat on WhatsApp');
    waFloat.textContent = '✆';
    document.body.appendChild(waFloat);
  }
}
